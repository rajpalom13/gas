import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!category) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(new Date().setDate(endDate.getDate() - 30));
    startDate.setHours(0, 0, 0, 0);

    const dateFilter = { date: { $gte: startDate, $lte: endDate } };

    // V5 settlements: unwind staffEntries -> unwind addOns + deductions
    const v5Results = await Settlement.aggregate([
      { $match: { ...dateFilter, schemaVersion: 5 } },
      { $unwind: "$staffEntries" },
      {
        $lookup: {
          from: "staffs",
          localField: "staffEntries.staff",
          foreignField: "_id",
          as: "staffInfo",
        },
      },
      { $unwind: { path: "$staffInfo", preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          addOns: [
            { $unwind: "$staffEntries.addOns" },
            { $match: { "staffEntries.addOns.category": category } },
            {
              $project: {
                date: 1,
                staffName: { $ifNull: ["$staffInfo.name", "Unknown"] },
                amount: "$staffEntries.addOns.amount",
                type: { $literal: "addon" },
              },
            },
          ],
          deductions: [
            { $unwind: "$staffEntries.deductions" },
            { $match: { "staffEntries.deductions.category": category } },
            {
              $project: {
                date: 1,
                staffName: { $ifNull: ["$staffInfo.name", "Unknown"] },
                amount: "$staffEntries.deductions.amount",
                type: { $literal: "deduction" },
              },
            },
          ],
        },
      },
    ]);

    // V3 settlements: unwind transactions
    const v3Results = await Settlement.aggregate([
      { $match: { ...dateFilter, schemaVersion: { $ne: 5 } } },
      { $unwind: "$transactions" },
      { $match: { "transactions.category": category } },
      {
        $lookup: {
          from: "staffs",
          localField: "staff",
          foreignField: "_id",
          as: "staffInfo",
        },
      },
      { $unwind: { path: "$staffInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          date: 1,
          staffName: { $ifNull: ["$staffInfo.name", "Unknown"] },
          amount: "$transactions.amount",
          type: {
            $cond: {
              if: { $eq: ["$transactions.type", "credit"] },
              then: "addon",
              else: "deduction",
            },
          },
        },
      },
    ]);

    const v5Data = v5Results[0] || { addOns: [], deductions: [] };
    const results = [...v5Data.addOns, ...v5Data.deductions, ...v3Results]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ results, category });
  } catch (error) {
    console.error("Category report error:", error);
    return NextResponse.json({ error: "Failed to fetch category report" }, { status: 500 });
  }
}
