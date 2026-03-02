import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Attendance } from "@/lib/models/Attendance";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const staffId = searchParams.get("staffId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const query: Record<string, unknown> = {};

    if (staffId) query.staff = staffId;

    // Date filter using IST timezone
    if (dateParam) {
      const startOfDay = new Date(dateParam + "T00:00:00.000+05:30");
      const endOfDay = new Date(dateParam + "T23:59:59.999+05:30");
      query.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      const start = new Date(startDate + "T00:00:00.000+05:30");
      const end = new Date(endDate + "T23:59:59.999+05:30");
      query.date = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(query)
      .populate("staff", "name")
      .sort({ date: -1 })
      .lean();

    return NextResponse.json(records);
  } catch (error) {
    console.error("Attendance GET error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json();

    // Bulk mode: { date, records: [{ staffId, status }] }
    if (body.records && Array.isArray(body.records)) {
      const { date, records } = body;
      const startOfDay = new Date(date + "T00:00:00.000+05:30");

      const ops = records.map((r: { staffId: string; status: string; note?: string }) => ({
        updateOne: {
          filter: { staff: r.staffId, date: startOfDay },
          update: {
            $set: {
              staff: r.staffId,
              date: startOfDay,
              status: r.status,
              note: r.note || "",
              markedBy: "web",
            },
          },
          upsert: true,
        },
      }));

      await Attendance.bulkWrite(ops);

      const updated = await Attendance.find({
        date: { $gte: startOfDay, $lte: new Date(date + "T23:59:59.999+05:30") },
      })
        .populate("staff", "name")
        .lean();

      return NextResponse.json(updated, { status: 201 });
    }

    // Single mode: { staffId, date, status, note? }
    const { staffId, date, status, note } = body;
    const startOfDay = new Date(date + "T00:00:00.000+05:30");

    const record = await Attendance.findOneAndUpdate(
      { staff: staffId, date: startOfDay },
      {
        $set: {
          staff: staffId,
          date: startOfDay,
          status,
          note: note || "",
          markedBy: "web",
        },
      },
      { upsert: true, new: true }
    ).populate("staff", "name");

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Attendance POST error:", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}
