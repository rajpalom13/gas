import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Inventory } from "@/lib/models/Inventory";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const inventory = await Inventory.find({}).sort({ cylinderSize: 1 }).lean();
    return NextResponse.json(inventory);
  } catch (error) {
    console.error("Inventory GET error:", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json();
    const { cylinderSize, fullStock, emptyStock, pricePerUnit } = body;

    // Managers cannot change pricePerUnit
    const update: Record<string, unknown> = { fullStock, emptyStock };
    if (session!.user.role === "admin") {
      update.pricePerUnit = pricePerUnit;
    }

    const inventory = await Inventory.findOneAndUpdate(
      { cylinderSize },
      update,
      { new: true }
    );

    if (!inventory) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    return NextResponse.json(inventory);
  } catch (error) {
    console.error("Inventory PUT error:", error);
    return NextResponse.json({ error: "Failed to update inventory" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (session!.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    await connectDB();
    const body = await request.json();
    const { cylinderSize, pricePerUnit } = body;

    if (!cylinderSize || pricePerUnit == null) {
      return NextResponse.json({ error: "cylinderSize and pricePerUnit are required" }, { status: 400 });
    }

    // Check duplicate
    const existing = await Inventory.findOne({ cylinderSize: cylinderSize.trim() });
    if (existing) {
      return NextResponse.json({ error: `Cylinder type "${cylinderSize}" already exists` }, { status: 409 });
    }

    const inventory = await Inventory.create({
      cylinderSize: cylinderSize.trim(),
      pricePerUnit,
      fullStock: 0,
      emptyStock: 0,
    });

    return NextResponse.json(inventory, { status: 201 });
  } catch (error: any) {
    console.error("Inventory POST error:", error);
    if (error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create inventory item" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (session!.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const cylinderSize = searchParams.get("cylinderSize");

    if (!cylinderSize) {
      return NextResponse.json({ error: "cylinderSize parameter required" }, { status: 400 });
    }

    const item = await Inventory.findOne({ cylinderSize });
    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    // Safety: Can't delete if stock > 0
    if (item.fullStock > 0 || item.emptyStock > 0) {
      return NextResponse.json({
        error: `Cannot delete "${cylinderSize}" — stock is not zero (Full: ${item.fullStock}, Empty: ${item.emptyStock}). Clear stock first.`
      }, { status: 400 });
    }

    // Safety: Can't delete if referenced in recent settlements
    const { Settlement } = await import("@/lib/models/Settlement");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsage = await Settlement.countDocuments({
      date: { $gte: thirtyDaysAgo },
      "items.cylinderSize": cylinderSize,
    });

    if (recentUsage > 0) {
      return NextResponse.json({
        error: `Cannot delete "${cylinderSize}" — used in ${recentUsage} settlement(s) in the last 30 days`
      }, { status: 400 });
    }

    await Inventory.deleteOne({ cylinderSize });
    return NextResponse.json({ message: `Cylinder type "${cylinderSize}" deleted successfully` });
  } catch (error) {
    console.error("Inventory DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 });
  }
}
