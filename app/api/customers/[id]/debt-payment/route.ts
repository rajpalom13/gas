import { NextResponse } from "next/server";
import { connectDB, withTransaction } from "@/lib/db";
import { Customer } from "@/lib/models/Customer";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const { type, amount, cylinderSize, quantity } = body;

    if (type !== "cash" && type !== "cylinder") {
      return NextResponse.json({ error: "Invalid type. Must be 'cash' or 'cylinder'" }, { status: 400 });
    }

    const result = await withTransaction(async (txSession) => {
      const customer = await Customer.findById(id).session(txSession);
      if (!customer) {
        throw new Error("Customer not found");
      }

      if (type === "cash") {
        if (!amount || amount <= 0) {
          throw new Error("Amount must be greater than 0");
        }
        if (amount > customer.cashDebt) {
          throw new Error(`Payment amount (${amount}) exceeds cash debt (${customer.cashDebt})`);
        }

        await Customer.findByIdAndUpdate(
          id,
          { $inc: { cashDebt: -amount } },
          { session: txSession }
        );
      } else {
        // type === "cylinder"
        if (!cylinderSize) {
          throw new Error("cylinderSize is required for cylinder debt payment");
        }
        if (!quantity || quantity <= 0) {
          throw new Error("Quantity must be greater than 0");
        }

        const debtEntry = customer.cylinderDebts.find(
          (d) => d.cylinderSize === cylinderSize
        );
        if (!debtEntry) {
          throw new Error(`No cylinder debt found for size ${cylinderSize}`);
        }
        if (quantity > debtEntry.quantity) {
          throw new Error(
            `Return quantity (${quantity}) exceeds cylinder debt (${debtEntry.quantity}) for ${cylinderSize}`
          );
        }

        const newQty = debtEntry.quantity - quantity;
        if (newQty === 0) {
          // Remove the entry entirely
          await Customer.findByIdAndUpdate(
            id,
            { $pull: { cylinderDebts: { cylinderSize } } },
            { session: txSession }
          );
        } else {
          // Decrement quantity
          await Customer.findOneAndUpdate(
            { _id: id, "cylinderDebts.cylinderSize": cylinderSize },
            { $inc: { "cylinderDebts.$.quantity": -quantity } },
            { session: txSession }
          );
        }
      }

      // Return updated customer
      const updated = await Customer.findById(id).session(txSession).lean();
      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Debt payment error:", error);
    const message = error instanceof Error ? error.message : "Failed to process debt payment";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
