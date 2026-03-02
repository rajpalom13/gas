import { NextResponse } from "next/server";
import { connectDB, withTransaction } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Staff } from "@/lib/models/Staff";
import { Inventory } from "@/lib/models/Inventory";
import { Customer } from "@/lib/models/Customer";
import { requireAuth } from "@/lib/auth";
import { computeSettlement } from "@/lib/settlement-utils";

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
    const groupByDate = searchParams.get("groupByDate") === "true";

    const query: Record<string, unknown> = {};
    if (staffId) query.staff = staffId;

    // Date filter using IST timezone
    if (dateParam) {
      const startOfDay = new Date(dateParam + "T00:00:00.000+05:30");
      const endOfDay = new Date(dateParam + "T23:59:59.999+05:30");
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    if (groupByDate) {
      const matchStage: Record<string, unknown> = {};
      if (staffId) matchStage.staff = staffId;
      if (dateParam) matchStage.date = query.date;

      const grouped = await Settlement.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "+05:30" } },
            staffIds: { $addToSet: "$staff" },
            totalCylinders: { $sum: { $sum: "$items.quantity" } },
            totalNewConnections: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $filter: { input: "$items", as: "it", cond: { $eq: ["$$it.isNewConnection", true] } } },
                    as: "nc",
                    in: "$$nc.quantity",
                  },
                },
              },
            },
            netRevenue: { $sum: { $ifNull: ["$netRevenue", "$expectedCash"] } },
            actualCash: { $sum: { $ifNull: ["$actualCashReceived", "$actualCash"] } },
            amountPending: { $sum: { $ifNull: ["$amountPending", "$shortage"] } },
            settlements: { $push: "$$ROOT" },
          },
        },
        { $sort: { _id: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]);

      const results = grouped.map((g) => {
        // Compute empty tally across all settlements for that day
        const emptyTally: Record<string, number> = {};
        for (const s of g.settlements) {
          for (const e of s.emptyCylindersReturned || []) {
            emptyTally[e.cylinderSize] = (emptyTally[e.cylinderSize] || 0) + e.quantity;
          }
        }

        return {
          date: g._id,
          staffCount: g.staffIds.length,
          totalCylinders: g.totalCylinders,
          totalNewConnections: g.totalNewConnections,
          netRevenue: g.netRevenue,
          actualCash: g.actualCash,
          amountPending: g.amountPending,
          emptyTally: Object.entries(emptyTally).map(([cylinderSize, quantity]) => ({ cylinderSize, quantity })),
        };
      });

      return NextResponse.json({ groups: results, page });
    }

    const [settlements, total] = await Promise.all([
      Settlement.find(query)
        .populate("staff", "name")
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

export async function POST(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json();

    const {
      staffId,
      date,
      items,
      transactions = [],
      actualCashReceived,
      notes,
      customerId,
      emptyCylindersReturned = [],
      debtors = [],
      denominations = [],
      denominationTotal = 0,
      // Legacy fields for backward compat during transition
      addPayment,
      reducePayment,
      expenses,
      actualCash,
    } = body;

    const result = await withTransaction(async (txSession) => {
      // Calculate gross revenue and validate stock
      let grossRevenue = 0;
      const processedItems = [];

      for (const item of items) {
        const inventory = await Inventory.findOne({ cylinderSize: item.cylinderSize }).session(txSession);
        if (!inventory) {
          throw new Error(`Inventory not found for ${item.cylinderSize}`);
        }

        if (inventory.fullStock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${item.cylinderSize}: only ${inventory.fullStock} available, requested ${item.quantity}`
          );
        }

        // Use priceOverride if provided, else inventory price
        const pricePerUnit = item.priceOverride != null ? item.priceOverride : inventory.pricePerUnit;
        const total = item.quantity * pricePerUnit;
        grossRevenue += total;

        processedItems.push({
          cylinderSize: item.cylinderSize,
          quantity: item.quantity,
          pricePerUnit,
          total,
          isNewConnection: item.isNewConnection || false,
        });

        // Update inventory: reduce full stock, increase empty stock
        await Inventory.findOneAndUpdate(
          { cylinderSize: item.cylinderSize },
          { $inc: { fullStock: -item.quantity, emptyStock: item.quantity } },
          { session: txSession }
        );
      }

      // Determine actual cash: prefer V3 field, fall back to legacy
      const cashReceived = actualCashReceived != null ? actualCashReceived : (actualCash || 0);

      // Use computeSettlement for calculations (V3 path)
      const computed = computeSettlement(processedItems, transactions, cashReceived);

      // If legacy fields were sent and no transactions, compute legacy-style
      // This handles backward compat during migration
      let finalComputed = computed;
      if (transactions.length === 0 && (addPayment || reducePayment || expenses)) {
        const legacyTransactions = [];
        if (addPayment) legacyTransactions.push({ category: "Other", type: "credit" as const, amount: addPayment });
        if (reducePayment) legacyTransactions.push({ category: "Discount", type: "debit" as const, amount: reducePayment });
        if (expenses) legacyTransactions.push({ category: "Other", type: "debit" as const, amount: expenses });
        finalComputed = computeSettlement(processedItems, legacyTransactions, cashReceived);
      }

      const [settlement] = await Settlement.create(
        [
          {
            staff: staffId,
            date: new Date(date),
            items: processedItems,
            grossRevenue: finalComputed.grossRevenue,
            // V3 fields
            transactions,
            totalCredits: finalComputed.totalCredits,
            totalDebits: finalComputed.totalDebits,
            netRevenue: finalComputed.netRevenue,
            actualCashReceived: cashReceived,
            amountPending: finalComputed.amountPending,
            emptyCylindersReturned,
            debtors: debtors.map((d: { customerId: string; type: string; amount?: number; cylinderSize?: string; quantity?: number }) => ({
              customer: d.customerId,
              type: d.type,
              amount: d.amount,
              cylinderSize: d.cylinderSize,
              quantity: d.quantity,
            })),
            schemaVersion: 3,
            // Legacy fields (dual-write)
            addPayment: finalComputed.addPayment,
            reducePayment: finalComputed.reducePayment,
            expenses: finalComputed.expenses,
            expectedCash: finalComputed.expectedCash,
            actualCash: cashReceived,
            shortage: finalComputed.shortage,
            // Common
            notes: notes || "",
            denominations,
            denominationTotal,
            createdBy: session!.user.id,
            customer: customerId || undefined,
          },
        ],
        { session: txSession }
      );

      // Process debtors: update Customer cashDebt/cylinderDebts
      for (const d of debtors) {
        if (d.type === "cash" && d.amount > 0) {
          await Customer.findByIdAndUpdate(
            d.customerId,
            { $inc: { cashDebt: d.amount } },
            { session: txSession }
          );
        } else if (d.type === "cylinder" && d.cylinderSize && d.quantity > 0) {
          // Try to increment existing cylinder debt entry
          const updated = await Customer.findOneAndUpdate(
            { _id: d.customerId, "cylinderDebts.cylinderSize": d.cylinderSize },
            { $inc: { "cylinderDebts.$.quantity": d.quantity } },
            { session: txSession }
          );
          // If no matching entry, push a new one
          if (!updated) {
            await Customer.findByIdAndUpdate(
              d.customerId,
              { $push: { cylinderDebts: { cylinderSize: d.cylinderSize, quantity: d.quantity } } },
              { session: txSession }
            );
          }
        }
      }

      // Update staff debt if amountPending > 0
      if (finalComputed.amountPending > 0) {
        await Staff.findByIdAndUpdate(staffId, { $inc: { debtBalance: finalComputed.amountPending } }, { session: txSession });
      }

      return settlement;
    });

    const populated = await Settlement.findById(result._id).populate("staff", "name").populate("customer", "name phone");

    return NextResponse.json(populated, { status: 201 });
  } catch (error) {
    console.error("Settlement POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to create settlement";
    const status = message.includes("Insufficient stock") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
