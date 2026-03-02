import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Attendance } from "@/lib/models/Attendance";
import { requireAuth } from "@/lib/auth";

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
    const { status, note } = body;

    const update: Record<string, unknown> = {};
    if (status !== undefined) update.status = status;
    if (note !== undefined) update.note = note;

    const record = await Attendance.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).populate("staff", "name");

    if (!record) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Attendance PUT error:", error);
    return NextResponse.json({ error: "Failed to update attendance" }, { status: 500 });
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

    const record = await Attendance.findByIdAndDelete(id);
    if (!record) {
      return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Attendance DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete attendance" }, { status: 500 });
  }
}
