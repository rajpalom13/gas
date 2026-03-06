import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB, withTransaction } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Staff } from "@/lib/models/Staff";
import { Inventory } from "@/lib/models/Inventory";
import { Customer } from "@/lib/models/Customer";
import { Category } from "@/lib/models/Category";
import { requireAuth } from "@/lib/auth";
import { computeStaffEntry } from "@/lib/settlement-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { id } = await params;

    const settlement = await Settlement.findById(id)
      .populate("staff", "name phone")
      .populate("customer", "name phone")
      .populate("debtors.customer", "name phone")
      .populate("staffEntries.staff", "name phone")
      .populate("staffEntries.deductions.debtorId", "name phone")
      .populate("staffEntries.emptyShortage.debtorId", "name phone")
      .lean();

    if (!settlement) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

    return NextResponse.json(settlement);
  } catch (error) {
    console.error("Settlement GET error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement" }, { status: 500 });
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

// Helper to reverse side effects of a V5 staff entry
async function reverseStaffEntry(
  entry: Record<string, unknown>,
  txSession: mongoose.ClientSession
) {
  const items = entry.items as Array<{ cylinderSize: string; quantity: number }>;
  const deductions = entry.deductions as Array<{ amount: number; debtorId?: { _id?: string } | string }>;
  const emptyShortage = entry.emptyShortage as Array<{ cylinderSize: string; shortQty: number; debtorId?: { _id?: string } | string }>;
  const staffDebtAdded = (entry.staffDebtAdded as number) || 0;
  const staffId = entry.staff;

  // Reverse inventory
  for (const item of items || []) {
    await Inventory.findOneAndUpdate(
      { cylinderSize: item.cylinderSize },
      { $inc: { fullStock: item.quantity, emptyStock: -item.quantity } },
      { session: txSession }
    );
  }

  // Reverse staff debt
  if (staffDebtAdded > 0) {
    const sid = typeof staffId === "object" && staffId !== null && "_id" in (staffId as Record<string, unknown>)
      ? (staffId as Record<string, unknown>)._id
      : staffId;
    await Staff.findByIdAndUpdate(sid, { $inc: { debtBalance: -staffDebtAdded } }, { session: txSession });
  }

  // Reverse customer cash debts from deductions
  for (const d of deductions || []) {
    if (d.debtorId && d.amount > 0) {
      const did = typeof d.debtorId === "object" && d.debtorId !== null && "_id" in d.debtorId
        ? d.debtorId._id
        : d.debtorId;
      await Customer.findByIdAndUpdate(did, { $inc: { cashDebt: -d.amount } }, { session: txSession });
    }
  }

  // Reverse cylinder debts from empty shortage
  for (const s of emptyShortage || []) {
    if (s.debtorId && s.shortQty > 0) {
      const did = typeof s.debtorId === "object" && s.debtorId !== null && "_id" in s.debtorId
        ? s.debtorId._id
        : s.debtorId;
      await Customer.findOneAndUpdate(
        { _id: did, "cylinderDebts.cylinderSize": s.cylinderSize } as any,
        { $inc: { "cylinderDebts.$.quantity": -s.shortQty } } as any,
        { session: txSession }
      );
    }
  }
}

// Helper to reverse V3 settlement side effects
async function reverseV3Settlement(
  settlement: Record<string, unknown>,
  txSession: mongoose.ClientSession
) {
  const items = settlement.items as Array<{ cylinderSize: string; quantity: number }>;
  const debtors = settlement.debtors as Array<{
    customer: unknown;
    type: string;
    amount?: number;
    cylinderSize?: string;
    quantity?: number;
  }>;

  // Reverse inventory
  for (const item of items || []) {
    await Inventory.findOneAndUpdate(
      { cylinderSize: item.cylinderSize },
      { $inc: { fullStock: item.quantity, emptyStock: -item.quantity } },
      { session: txSession }
    );
  }

  // Reverse staff debt
  const pending = (settlement.amountPending as number) || (settlement.shortage as number) || 0;
  if (pending > 0) {
    await Staff.findByIdAndUpdate(settlement.staff, { $inc: { debtBalance: -pending } }, { session: txSession });
  }

  // Reverse customer debts
  for (const d of debtors || []) {
    const cid = typeof d.customer === "object" && d.customer !== null && "_id" in (d.customer as Record<string, unknown>)
      ? (d.customer as Record<string, unknown>)._id
      : d.customer;
    if (d.type === "cash" && d.amount && d.amount > 0) {
      await Customer.findByIdAndUpdate(cid, { $inc: { cashDebt: -d.amount } }, { session: txSession });
    } else if (d.type === "cylinder" && d.cylinderSize && d.quantity && d.quantity > 0) {
      await Customer.findOneAndUpdate(
        { _id: cid, "cylinderDebts.cylinderSize": d.cylinderSize } as any,
        { $inc: { "cylinderDebts.$.quantity": -d.quantity } } as any,
        { session: txSession }
      );
    }
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const { date, staffEntries: rawEntries } = body as {
      date: string;
      staffEntries: StaffEntryInput[];
    };

    const result = await withTransaction(async (txSession) => {
      const oldSettlement = await Settlement.findById(id).session(txSession).lean();
      if (!oldSettlement) throw new Error("Settlement not found");

      const oldDoc = oldSettlement as unknown as Record<string, unknown>;

      // Reverse old side effects based on schema version
      if ((oldDoc.schemaVersion as number) === 5 && oldDoc.staffEntries) {
        const entries = oldDoc.staffEntries as Array<Record<string, unknown>>;
        for (const entry of entries) {
          await reverseStaffEntry(entry, txSession);
        }
      } else {
        await reverseV3Settlement(oldDoc, txSession);
      }

      // Apply new entries (same logic as POST)
      const processedEntries = [];
      let totalGrossRevenue = 0;
      let totalAddOnsSum = 0;
      let totalDeductionsSum = 0;
      let totalExpectedSum = 0;
      let totalActualReceivedSum = 0;
      let totalCashDiffSum = 0;
      const categoriesToSave = new Set<string>();

      for (const entry of rawEntries) {
        let grossRevenue = 0;
        const processedItems = [];

        for (const item of entry.items) {
          if (!item.cylinderSize || item.quantity <= 0) continue;

          const inventory = await Inventory.findOne({ cylinderSize: item.cylinderSize }).session(txSession);
          if (!inventory) throw new Error(`Inventory not found for ${item.cylinderSize}`);
          if (inventory.fullStock < item.quantity) {
            throw new Error(`Insufficient stock for ${item.cylinderSize}: only ${inventory.fullStock} available, requested ${item.quantity}`);
          }

          const pricePerUnit = item.priceOverride != null && item.priceOverride > 0
            ? item.priceOverride : inventory.pricePerUnit;
          const total = item.quantity * pricePerUnit;
          grossRevenue += total;

          processedItems.push({ cylinderSize: item.cylinderSize, quantity: item.quantity, pricePerUnit, total });

          await Inventory.findOneAndUpdate(
            { cylinderSize: item.cylinderSize },
            { $inc: { fullStock: -item.quantity, emptyStock: item.quantity } },
            { session: txSession }
          );
        }

        for (const a of entry.addOns) {
          if (a.category) categoriesToSave.add(`addon:${a.category}`);
        }
        for (const d of entry.deductions) {
          if (d.category) categoriesToSave.add(`deduction:${d.category}`);
        }

        const validAddOns = entry.addOns.filter(a => a.category && a.amount > 0);
        const validDeductions = entry.deductions.filter(d => d.category && d.amount > 0);
        const validDenominations = entry.denominations.filter(d => d.count > 0);

        const computed = computeStaffEntry(processedItems, validAddOns, validDeductions, validDenominations);

        const staffDebtAdded = entry.addToStaffDebt && computed.cashDifference > 0
          ? computed.cashDifference : 0;

        if (staffDebtAdded > 0) {
          await Staff.findByIdAndUpdate(entry.staffId, { $inc: { debtBalance: staffDebtAdded } }, { session: txSession });
        }

        for (const d of validDeductions) {
          if (d.debtorId && d.amount > 0) {
            await Customer.findByIdAndUpdate(d.debtorId, { $inc: { cashDebt: d.amount } }, { session: txSession });
          }
        }

        const validEmptyShortage = (entry.emptyShortage || []).filter(s => s.cylinderSize && s.shortQty > 0 && s.debtorId);
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

        processedEntries.push({
          staff: entry.staffId,
          items: processedItems,
          grossRevenue: computed.grossRevenue,
          addOns: validAddOns,
          deductions: validDeductions.map(d => ({
            category: d.category, amount: d.amount,
            debtorId: d.debtorId || undefined, debtorName: d.debtorName || undefined,
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
            cylinderSize: s.cylinderSize, shortQty: s.shortQty,
            debtorId: s.debtorId || undefined, debtorName: s.debtorName || undefined,
          })),
          notes: entry.notes || "",
        });

        totalGrossRevenue += computed.grossRevenue;
        totalAddOnsSum += computed.totalAddOns;
        totalDeductionsSum += computed.totalDeductions;
        totalExpectedSum += computed.amountExpected;
        totalActualReceivedSum += computed.denominationTotal;
        totalCashDiffSum += computed.cashDifference;
      }

      // Save categories
      const categoryOps = Array.from(categoriesToSave).map(key => {
        const [type, name] = key.split(":", 2);
        return Category.findOneAndUpdate({ name, type }, { name, type }, { upsert: true, session: txSession });
      });
      await Promise.all(categoryOps);

      // Update the settlement to V5
      const updated = await Settlement.findByIdAndUpdate(
        id,
        {
          date: new Date(date + "T00:00:00.000+05:30"),
          staffEntries: processedEntries,
          totalGrossRevenue,
          totalAddOns: totalAddOnsSum,
          totalDeductions: totalDeductionsSum,
          totalExpected: totalExpectedSum,
          totalActualReceived: totalActualReceivedSum,
          totalCashDifference: totalCashDiffSum,
          schemaVersion: 5,
          // Clear V3 flat fields
          staff: undefined,
          customer: undefined,
          items: [],
          transactions: [],
          totalCredits: 0,
          totalDebits: 0,
          netRevenue: 0,
          actualCashReceived: 0,
          amountPending: 0,
          debtors: [],
          grossRevenue: 0,
          addPayment: 0,
          reducePayment: 0,
          expenses: 0,
          expectedCash: 0,
          actualCash: 0,
          shortage: 0,
        },
        { new: true, session: txSession }
      );

      return updated;
    });

    const populated = await Settlement.findById(result!._id)
      .populate("staffEntries.staff", "name phone")
      .populate("staffEntries.deductions.debtorId", "name phone")
      .populate("staffEntries.emptyShortage.debtorId", "name phone");

    return NextResponse.json(populated);
  } catch (error) {
    console.error("Settlement PUT error:", error);
    const message = error instanceof Error ? error.message : "Failed to update settlement";
    const status = message.includes("Insufficient stock") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { id } = await params;

    await withTransaction(async (txSession) => {
      const settlement = await Settlement.findById(id).session(txSession).lean();
      if (!settlement) throw new Error("Settlement not found");

      const doc = settlement as unknown as Record<string, unknown>;

      // Reverse side effects based on schema version
      if ((doc.schemaVersion as number) === 5 && doc.staffEntries) {
        const entries = doc.staffEntries as Array<Record<string, unknown>>;
        for (const entry of entries) {
          await reverseStaffEntry(entry, txSession);
        }
      } else {
        await reverseV3Settlement(doc, txSession);
      }

      await Settlement.findByIdAndDelete(id, { session: txSession });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settlement DELETE error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete settlement";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
