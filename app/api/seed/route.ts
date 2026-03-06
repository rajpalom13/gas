import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Inventory } from "@/lib/models/Inventory";
import { Category } from "@/lib/models/Category";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();

    // Seed admin user
    const existingAdmin = await User.findOne({ email: "admin@gasagency.com" });
    if (!existingAdmin) {
      const hashedPassword = await bcryptjs.hash("admin123", 12);
      await User.create({
        name: "Admin",
        email: "admin@gasagency.com",
        password: hashedPassword,
        role: "admin",
      });
    }

    // Seed manager user
    const existingManager = await User.findOne({ email: "manager@gasagency.com" });
    if (!existingManager) {
      const hashedPassword = await bcryptjs.hash("manager123", 12);
      await User.create({
        name: "Manager",
        email: "manager@gasagency.com",
        password: hashedPassword,
        role: "manager",
      });
    }

    // Seed inventory with default prices
    const defaultInventory = [
      { cylinderSize: "5kg", fullStock: 50, emptyStock: 20, pricePerUnit: 500 },
      { cylinderSize: "10kg", fullStock: 100, emptyStock: 30, pricePerUnit: 900 },
      { cylinderSize: "14kg", fullStock: 80, emptyStock: 25, pricePerUnit: 1200 },
      { cylinderSize: "19kg", fullStock: 60, emptyStock: 15, pricePerUnit: 1800 },
    ];

    for (const item of defaultInventory) {
      await Inventory.findOneAndUpdate(
        { cylinderSize: item.cylinderSize },
        { $setOnInsert: item },
        { upsert: true, new: true }
      );
    }

    // Seed default categories
    const defaultCategories = [
      { name: "Paytm", type: "addon" as const },
      { name: "Cash", type: "addon" as const },
      { name: "UPI", type: "addon" as const },
      { name: "PhonePe", type: "addon" as const },
      { name: "Fuel", type: "deduction" as const },
      { name: "Discount", type: "deduction" as const },
      { name: "Return", type: "deduction" as const },
    ];

    for (const cat of defaultCategories) {
      await Category.findOneAndUpdate(
        { name: cat.name, type: cat.type },
        { $setOnInsert: cat },
        { upsert: true, new: true }
      );
    }

    return NextResponse.json({ message: "Database seeded successfully" });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: "Failed to seed database" }, { status: 500 });
  }
}
