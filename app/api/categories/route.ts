import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Category } from "@/lib/models/Category";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const query: Record<string, unknown> = {};
    if (type === "addon" || type === "deduction") {
      query.type = type;
    }

    const categories = await Category.find(query).sort({ name: 1 }).lean();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Categories GET error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { name, type } = await request.json();

    if (!name || !type) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 });
    }
    if (type !== "addon" && type !== "deduction") {
      return NextResponse.json({ error: "type must be addon or deduction" }, { status: 400 });
    }

    const category = await Category.findOneAndUpdate(
      { name, type },
      { name, type },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Categories POST error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
