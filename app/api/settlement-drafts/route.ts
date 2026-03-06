import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SettlementDraft } from "@/lib/models/SettlementDraft";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return NextResponse.json({ error: "date query param is required" }, { status: 400 });
    }

    const startOfDay = new Date(dateParam + "T00:00:00.000+05:30");
    const endOfDay = new Date(dateParam + "T23:59:59.999+05:30");

    const draft = await SettlementDraft.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    return NextResponse.json({ draft: draft || null });
  } catch (error) {
    console.error("SettlementDrafts GET error:", error);
    return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { date, data } = await request.json();

    if (!date || !data) {
      return NextResponse.json({ error: "date and data are required" }, { status: 400 });
    }

    const dateObj = new Date(date + "T00:00:00.000+05:30");

    const draft = await SettlementDraft.findOneAndUpdate(
      { date: dateObj },
      { date: dateObj, data, createdBy: session?.user?.id },
      { upsert: true, new: true }
    );

    return NextResponse.json(draft);
  } catch (error) {
    console.error("SettlementDrafts PUT error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return NextResponse.json({ error: "date query param is required" }, { status: 400 });
    }

    const startOfDay = new Date(dateParam + "T00:00:00.000+05:30");
    const endOfDay = new Date(dateParam + "T23:59:59.999+05:30");

    await SettlementDraft.deleteOne({
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SettlementDrafts DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
