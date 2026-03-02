import { NextResponse } from "next/server";
import { connectDB, withTransaction } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Staff } from "@/lib/models/Staff";
import { Inventory } from "@/lib/models/Inventory";
import { Customer } from "@/lib/models/Customer";
import { requireAuth } from "@/lib/auth";
import { computeSettlement } from "@/lib/settlement-utils";

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
    const {
      date,
      items,
      transactions = [],
      actualCashReceived,
      notes,
      denominations,
      denominationTotal,
      emptyCylindersReturned = [],
      debtors = [],
      // Legacy fields for backward compat
      addPayment,
      reducePayment,
      expenses,
      actualCash,
    } = body;

    const result = await withTransaction(async (txSession) => {
      // Fetch the existing settlement
      const oldSettlement = await Settlement.findById(id).session(txSession);
      if (!oldSettlement) {
        throw new Error("Settlement not found");
      }

      // Step 1: Reverse old inventory changes (add back full, subtract empty)
      for (const oldItem of oldSettlement.items) {
        await Inventory.findOneAndUpdate(
          { cylinderSize: oldItem.cylinderSize },
          { $inc: { fullStock: oldItem.quantity, emptyStock: -oldItem.quantity } },
          { session: txSession }
        );
      }

      // Step 2: Reverse old debt (use amountPending for V3, shortage for legacy)
      const oldPending = oldSettlement.amountPending || oldSettlement.shortage || 0;
      if (oldPending > 0) {
        await Staff.findByIdAndUpdate(
          oldSettlement.staff,
          { $inc: { debtBalance: -oldPending } },
          { session: txSession }
        );
      }

      // Step 3: Reverse old customer debts from debtors
      for (const d of oldSettlement.debtors || []) {
        if (d.type === "cash" && d.amount && d.amount > 0) {
          await Customer.findByIdAndUpdate(
            d.customer,
            { $inc: { cashDebt: -d.amount } },
            { session: txSession }
          );
        } else if (d.type === "cylinder" && d.cylinderSize && d.quantity && d.quantity > 0) {
          await Customer.findOneAndUpdate(
            { _id: d.customer, "cylinderDebts.cylinderSize": d.cylinderSize },
            { $inc: { "cylinderDebts.$.quantity": -d.quantity } },
            { session: txSession }
          );
        }
      }

      // Step 4: Validate new stock levels and calculate new values
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
      }

      // Step 5: Apply new inventory changes (subtract full, add empty)
      for (const item of items) {
        await Inventory.findOneAndUpdate(
          { cylinderSize: item.cylinderSize },
          { $inc: { fullStock: -item.quantity, emptyStock: item.quantity } },
          { session: txSession }
        );
      }

      // Determine actual cash
      const cashReceived = actualCashReceived != null ? actualCashReceived : (actualCash || 0);

      // Step 6: Use computeSettlement for calculations
      const computed = computeSettlement(processedItems, transactions, cashReceived);

      let finalComputed = computed;
      if (transactions.length === 0 && (addPayment || reducePayment || expenses)) {
        const legacyTransactions = [];
        if (addPayment) legacyTransactions.push({ category: "Other", type: "credit" as const, amount: addPayment });
        if (reducePayment) legacyTransactions.push({ category: "Discount", type: "debit" as const, amount: reducePayment });
        if (expenses) legacyTransactions.push({ category: "Other", type: "debit" as const, amount: expenses });
        finalComputed = computeSettlement(processedItems, legacyTransactions, cashReceived);
      }

      // Step 7: Update the settlement with V3 + legacy fields (dual-write)
      const updated = await Settlement.findByIdAndUpdate(
        id,
        {
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
          denominations: denominations || [],
          denominationTotal: denominationTotal || 0,
        },
        { new: true, session: txSession }
      );

      // Step 8: Apply new debtor assignments
      for (const d of debtors) {
        if (d.type === "cash" && d.amount > 0) {
          await Customer.findByIdAndUpdate(
            d.customerId,
            { $inc: { cashDebt: d.amount } },
            { session: txSession }
          );
        } else if (d.type === "cylinder" && d.cylinderSize && d.quantity > 0) {
          const updatedCustomer = await Customer.findOneAndUpdate(
            { _id: d.customerId, "cylinderDebts.cylinderSize": d.cylinderSize },
            { $inc: { "cylinderDebts.$.quantity": d.quantity } },
            { session: txSession }
          );
          if (!updatedCustomer) {
            await Customer.findByIdAndUpdate(
              d.customerId,
              { $push: { cylinderDebts: { cylinderSize: d.cylinderSize, quantity: d.quantity } } },
              { session: txSession }
            );
          }
        }
      }

      // Step 9: Apply new staff debt using amountPending
      if (finalComputed.amountPending > 0) {
        await Staff.findByIdAndUpdate(
          oldSettlement.staff,
          { $inc: { debtBalance: finalComputed.amountPending } },
          { session: txSession }
        );
      }

      return updated;
    });

    const populated = await Settlement.findById(result!._id)
      .populate("staff", "name phone")
      .populate("customer", "name phone")
      .populate("debtors.customer", "name phone");

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
      // Fetch the settlement
      const settlement = await Settlement.findById(id).session(txSession);
      if (!settlement) {
        throw new Error("Settlement not found");
      }

      // Step 1: Reverse inventory (add back full, subtract empty)
      for (const item of settlement.items) {
        await Inventory.findOneAndUpdate(
          { cylinderSize: item.cylinderSize },
          { $inc: { fullStock: item.quantity, emptyStock: -item.quantity } },
          { session: txSession }
        );
      }

      // Step 2: Reverse debt (use amountPending for V3, shortage for legacy)
      const pending = settlement.amountPending || settlement.shortage || 0;
      if (pending > 0) {
        await Staff.findByIdAndUpdate(
          settlement.staff,
          { $inc: { debtBalance: -pending } },
          { session: txSession }
        );
      }

      // Step 3: Reverse customer debts from debtors
      for (const d of settlement.debtors || []) {
        if (d.type === "cash" && d.amount && d.amount > 0) {
          await Customer.findByIdAndUpdate(
            d.customer,
            { $inc: { cashDebt: -d.amount } },
            { session: txSession }
          );
        } else if (d.type === "cylinder" && d.cylinderSize && d.quantity && d.quantity > 0) {
          await Customer.findOneAndUpdate(
            { _id: d.customer, "cylinderDebts.cylinderSize": d.cylinderSize },
            { $inc: { "cylinderDebts.$.quantity": -d.quantity } },
            { session: txSession }
          );
        }
      }

      // Step 4: Delete the settlement
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
