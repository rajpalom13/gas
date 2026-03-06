import { NextResponse } from "next/server";
import { connectDB, withTransaction } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Staff } from "@/lib/models/Staff";
import { Inventory } from "@/lib/models/Inventory";
import { Customer } from "@/lib/models/Customer";
import { Category } from "@/lib/models/Category";
import { requireAuth } from "@/lib/auth";
import { computeStaffEntry, computeConsolidated } from "@/lib/settlement-utils";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staffId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const dateParam = searchParams.get("date");

    const query: Record<string, unknown> = {};

    // Date filter using IST timezone
    if (dateParam) {
      const startOfDay = new Date(dateParam + "T00:00:00.000+05:30");
      const endOfDay = new Date(dateParam + "T23:59:59.999+05:30");
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    // For V5, staffId filter needs to check staffEntries.staff
    if (staffId) {
      query.$or = [
        { staff: staffId },
        { "staffEntries.staff": staffId },
      ];
    }

    const [settlements, total] = await Promise.all([
      Settlement.find(query)
        .populate("staff", "name")
        .populate("staffEntries.staff", "name")
        .populate("customer", "name phone")
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Settlement.countDocuments(query),
    ]);

    return NextResponse.json({ settlements, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Settlements GET error:", error);
    return NextResponse.json({ error: "Failed to fetch settlements" }, { status: 500 });
  }
}

interface StaffEntryInput {
  staffId: string;
  items: Array<{
    cylinderSize: string;
    quantity: number;
    priceOverride?: number;
  }>;
  addOns: Array<{ category: string; amount: number }>;
  deductions: Array<{
    category: string;
    amount: number;
    debtorId?: string;
    debtorName?: string;
  }>;
  denominations: Array<{ note: number; count: number; total: number }>;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  emptyShortage: Array<{
    cylinderSize: string;
    shortQty: number;
    debtorId?: string;
    debtorName?: string;
  }>;
  addToStaffDebt: boolean;
  notes: string;
}

export async function POST(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json();
    const { date, staffEntries: rawEntries } = body as {
      date: string;
      staffEntries: StaffEntryInput[];
    };

    if (!rawEntries || rawEntries.length === 0) {
      return NextResponse.json({ error: "At least one delivery man entry is required" }, { status: 400 });
    }

    const result = await withTransaction(async (txSession) => {
      const processedEntries = [];
      let totalGrossRevenue = 0;
      let totalAddOnsSum = 0;
      let totalDeductionsSum = 0;
      let totalExpected = 0;
      let totalActualReceived = 0;
      let totalCashDiff = 0;

      // Collect unique categories to upsert
      const categoriesToSave = new Set<string>();

      for (const entry of rawEntries) {
        // Process items: validate stock and compute prices
        let grossRevenue = 0;
        const processedItems = [];

        for (const item of entry.items) {
          if (!item.cylinderSize || item.quantity <= 0) continue;

          const inventory = await Inventory.findOne({ cylinderSize: item.cylinderSize }).session(txSession);
          if (!inventory) {
            throw new Error(`Inventory not found for ${item.cylinderSize}`);
          }
          if (inventory.fullStock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${item.cylinderSize}: only ${inventory.fullStock} available, requested ${item.quantity}`
            );
          }

          const pricePerUnit = item.priceOverride != null && item.priceOverride > 0
            ? item.priceOverride
            : inventory.pricePerUnit;
          const total = item.quantity * pricePerUnit;
          grossRevenue += total;

          processedItems.push({
            cylinderSize: item.cylinderSize,
            quantity: item.quantity,
            pricePerUnit,
            total,
          });

          // Update inventory: reduce full stock, increase empty stock
          await Inventory.findOneAndUpdate(
            { cylinderSize: item.cylinderSize },
            { $inc: { fullStock: -item.quantity, emptyStock: item.quantity } },
            { session: txSession }
          );
        }

        // Collect categories for auto-save
        for (const a of entry.addOns) {
          if (a.category) categoriesToSave.add(`addon:${a.category}`);
        }
        for (const d of entry.deductions) {
          if (d.category) categoriesToSave.add(`deduction:${d.category}`);
        }

        // Compute settlement figures
        const validAddOns = entry.addOns.filter(a => a.category && a.amount > 0);
        const validDeductions = entry.deductions.filter(d => d.category && d.amount > 0);
        const validDenominations = entry.denominations.filter(d => d.count > 0);

        const computed = computeStaffEntry(
          processedItems,
          validAddOns,
          validDeductions,
          validDenominations
        );

        // Determine staff debt
        const staffDebtAdded = entry.addToStaffDebt && computed.cashDifference > 0
          ? computed.cashDifference
          : 0;

        // Update staff debt
        if (staffDebtAdded > 0) {
          await Staff.findByIdAndUpdate(
            entry.staffId,
            { $inc: { debtBalance: staffDebtAdded } },
            { session: txSession }
          );
        }

        // Process deduction debtors (customer debt)
        for (const d of validDeductions) {
          if (d.debtorId && d.amount > 0) {
            await Customer.findByIdAndUpdate(
              d.debtorId,
              { $inc: { cashDebt: d.amount } },
              { session: txSession }
            );
          }
        }

        // Process empty shortage debtors (cylinder debt)
        const validEmptyShortage = (entry.emptyShortage || []).filter(
          s => s.cylinderSize && s.shortQty > 0 && s.debtorId
        );
        for (const s of validEmptyShortage) {
          const updated = await Customer.findOneAndUpdate(
            { _id: s.debtorId, "cylinderDebts.cylinderSize": s.cylinderSize } as any,
            { $inc: { "cylinderDebts.$.quantity": s.shortQty } } as any,
            { session: txSession }
          );
          if (!updated) {
            await Customer.findByIdAndUpdate(
              s.debtorId,
              { $push: { cylinderDebts: { cylinderSize: s.cylinderSize, quantity: s.shortQty } } } as any,
              { session: txSession }
            );
          }
        }

        const staffEntry = {
          staff: entry.staffId,
          items: processedItems,
          grossRevenue: computed.grossRevenue,
          addOns: validAddOns,
          deductions: validDeductions.map(d => ({
            category: d.category,
            amount: d.amount,
            debtorId: d.debtorId || undefined,
            debtorName: d.debtorName || undefined,
          })),
          totalAddOns: computed.totalAddOns,
          totalDeductions: computed.totalDeductions,
          amountExpected: computed.amountExpected,
          denominations: validDenominations,
          denominationTotal: computed.denominationTotal,
          cashDifference: computed.cashDifference,
          staffDebtAdded,
          emptyCylindersReturned: (entry.emptyCylindersReturned || []).filter(e => e.quantity > 0),
          emptyShortage: validEmptyShortage.map(s => ({
            cylinderSize: s.cylinderSize,
            shortQty: s.shortQty,
            debtorId: s.debtorId || undefined,
            debtorName: s.debtorName || undefined,
          })),
          notes: entry.notes || "",
        };

        processedEntries.push(staffEntry);
        totalGrossRevenue += computed.grossRevenue;
        totalAddOnsSum += computed.totalAddOns;
        totalDeductionsSum += computed.totalDeductions;
        totalExpected += computed.amountExpected;
        totalActualReceived += computed.denominationTotal;
        totalCashDiff += computed.cashDifference;
      }

      // Auto-save categories
      const categoryOps = Array.from(categoriesToSave).map(key => {
        const [type, name] = key.split(":", 2);
        return Category.findOneAndUpdate(
          { name, type },
          { name, type },
          { upsert: true, session: txSession }
        );
      });
      await Promise.all(categoryOps);

      // Create the V5 settlement
      const [settlement] = await Settlement.create(
        [{
          date: new Date(date + "T00:00:00.000+05:30"),
          staffEntries: processedEntries,
          totalGrossRevenue,
          totalAddOns: totalAddOnsSum,
          totalDeductions: totalDeductionsSum,
          totalExpected,
          totalActualReceived,
          totalCashDifference: totalCashDiff,
          schemaVersion: 5,
          createdBy: session!.user.id,
        }],
        { session: txSession }
      );

      return settlement;
    });

    const populated = await Settlement.findById(result._id)
      .populate("staffEntries.staff", "name");

    return NextResponse.json(populated, { status: 201 });
  } catch (error) {
    console.error("Settlement POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to create settlement";
    const status = message.includes("Insufficient stock") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
