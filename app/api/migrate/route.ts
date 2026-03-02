import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();

    // Find all settlements without schemaVersion 3
    const oldSettlements = await Settlement.find({
      $or: [
        { schemaVersion: { $exists: false } },
        { schemaVersion: { $lt: 3 } },
      ],
    });

    let migrated = 0;

    for (const settlement of oldSettlements) {
      const transactions = [];

      // Convert addPayment → credit transaction
      if (settlement.addPayment > 0) {
        transactions.push({
          category: "Cash",
          type: "credit" as const,
          amount: settlement.addPayment,
          note: "Migrated from addPayment",
        });
      }

      // Convert reducePayment → debit transaction
      if (settlement.reducePayment > 0) {
        transactions.push({
          category: "Discount",
          type: "debit" as const,
          amount: settlement.reducePayment,
          note: "Migrated from reducePayment",
        });
      }

      // Convert expenses → debit transaction
      if (settlement.expenses > 0) {
        transactions.push({
          category: "Fuel",
          type: "debit" as const,
          amount: settlement.expenses,
          note: "Migrated from expenses",
        });
      }

      const totalCredits = transactions
        .filter((t) => t.type === "credit")
        .reduce((acc, t) => acc + t.amount, 0);
      const totalDebits = transactions
        .filter((t) => t.type === "debit")
        .reduce((acc, t) => acc + t.amount, 0);

      await Settlement.findByIdAndUpdate(settlement._id, {
        $set: {
          schemaVersion: 3,
          transactions,
          totalCredits,
          totalDebits,
          netRevenue: settlement.expectedCash,
          actualCashReceived: settlement.actualCash,
          amountPending: settlement.shortage,
          emptyCylindersReturned: [],
          debtors: [],
          "items.$[].isNewConnection": false,
        },
      });

      migrated++;
    }

    return NextResponse.json({
      success: true,
      migrated,
      message: `Migrated ${migrated} settlements to V3 schema`,
    });
  } catch (err) {
    console.error("Migration error:", err);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
