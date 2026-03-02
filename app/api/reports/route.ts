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
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // Default: last 30 days
    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(new Date().setDate(endDate.getDate() - 30));
    startDate.setHours(0, 0, 0, 0);

    const dateFilter = { date: { $gte: startDate, $lte: endDate } };

    // Run all aggregations in parallel
    const [
      summaryResult,
      staffBreakdown,
      cylinderBreakdown,
      dailyTrends,
      transactionBreakdown,
      newConnectionReport,
      emptyReconciliation,
    ] = await Promise.all([
      // Summary aggregation - updated with V3 fields
      Settlement.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalSettlements: { $sum: 1 },
            totalRevenue: { $sum: "$grossRevenue" },
            totalExpenses: { $sum: "$expenses" },
            totalShortage: { $sum: "$shortage" },
            totalActualCash: { $sum: { $ifNull: ["$actualCashReceived", "$actualCash"] } },
            totalDeliveries: {
              $sum: { $sum: "$items.quantity" },
            },
            // V3 fields
            totalCredits: { $sum: { $ifNull: ["$totalCredits", "$addPayment"] } },
            totalDebits: {
              $sum: {
                $ifNull: [
                  "$totalDebits",
                  { $add: [{ $ifNull: ["$reducePayment", 0] }, { $ifNull: ["$expenses", 0] }] },
                ],
              },
            },
            totalAmountPending: { $sum: { $ifNull: ["$amountPending", "$shortage"] } },
            totalNewConnections: {
              $sum: {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: "$items",
                        as: "it",
                        cond: { $eq: ["$$it.isNewConnection", true] },
                      },
                    },
                    as: "nc",
                    in: "$$nc.quantity",
                  },
                },
              },
            },
          },
        },
      ]),

      // Staff breakdown with credits/debits
      Settlement.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$staff",
            settlementCount: { $sum: 1 },
            totalRevenue: { $sum: "$grossRevenue" },
            totalExpenses: { $sum: "$expenses" },
            totalShortage: { $sum: "$shortage" },
            totalDeliveries: {
              $sum: { $sum: "$items.quantity" },
            },
            totalCredits: { $sum: { $ifNull: ["$totalCredits", "$addPayment"] } },
            totalDebits: {
              $sum: {
                $ifNull: [
                  "$totalDebits",
                  { $add: [{ $ifNull: ["$reducePayment", 0] }, { $ifNull: ["$expenses", 0] }] },
                ],
              },
            },
          },
        },
        {
          $lookup: {
            from: "staffs",
            localField: "_id",
            foreignField: "_id",
            as: "staffInfo",
          },
        },
        { $unwind: { path: "$staffInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            staffId: "$_id",
            staffName: { $ifNull: ["$staffInfo.name", "Unknown"] },
            settlementCount: 1,
            totalRevenue: 1,
            totalExpenses: 1,
            totalShortage: 1,
            totalDeliveries: 1,
            totalCredits: 1,
            totalDebits: 1,
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Cylinder breakdown using $unwind
      Settlement.aggregate([
        { $match: dateFilter },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.cylinderSize",
            totalQuantity: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.total" },
          },
        },
        {
          $project: {
            cylinderSize: "$_id",
            totalQuantity: 1,
            totalRevenue: 1,
          },
        },
        { $sort: { cylinderSize: 1 } },
      ]),

      // Daily trends
      Settlement.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$date" },
            },
            revenue: { $sum: "$grossRevenue" },
            deliveries: { $sum: { $sum: "$items.quantity" } },
            settlements: { $sum: 1 },
          },
        },
        {
          $project: {
            date: "$_id",
            revenue: 1,
            deliveries: 1,
            settlements: 1,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Transaction category breakdown: sum amounts by category and type
      Settlement.aggregate([
        { $match: { ...dateFilter, "transactions.0": { $exists: true } } },
        { $unwind: "$transactions" },
        {
          $group: {
            _id: {
              category: "$transactions.category",
              type: "$transactions.type",
            },
            totalAmount: { $sum: "$transactions.amount" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            category: "$_id.category",
            type: "$_id.type",
            totalAmount: 1,
            count: 1,
          },
        },
        { $sort: { type: 1, totalAmount: -1 } },
      ]),

      // New connection report: count DBC items by cylinder size
      Settlement.aggregate([
        { $match: dateFilter },
        { $unwind: "$items" },
        { $match: { "items.isNewConnection": true } },
        {
          $group: {
            _id: "$items.cylinderSize",
            totalNewConnections: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.total" },
          },
        },
        {
          $project: {
            cylinderSize: "$_id",
            totalNewConnections: 1,
            totalRevenue: 1,
          },
        },
        { $sort: { cylinderSize: 1 } },
      ]),

      // Empty reconciliation summary: aggregate empties data
      Settlement.aggregate([
        { $match: dateFilter },
        {
          $facet: {
            issued: [
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.cylinderSize",
                  issued: { $sum: "$items.quantity" },
                  newConnections: {
                    $sum: { $cond: [{ $eq: ["$items.isNewConnection", true] }, "$items.quantity", 0] },
                  },
                },
              },
            ],
            returned: [
              { $unwind: "$emptyCylindersReturned" },
              {
                $group: {
                  _id: "$emptyCylindersReturned.cylinderSize",
                  returned: { $sum: "$emptyCylindersReturned.quantity" },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const summary = summaryResult[0] || {
      totalSettlements: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      totalShortage: 0,
      totalActualCash: 0,
      totalDeliveries: 0,
      totalCredits: 0,
      totalDebits: 0,
      totalAmountPending: 0,
      totalNewConnections: 0,
    };

    // Process empty reconciliation from facet results
    interface IssuedEntry { _id: string; issued: number; newConnections: number }
    interface ReturnedEntry { _id: string; returned: number }

    const emptyData = emptyReconciliation[0] || { issued: [], returned: [] };
    const issuedMap = new Map<string, IssuedEntry>(
      emptyData.issued.map((i: IssuedEntry) => [i._id, i])
    );
    const returnedMap = new Map<string, ReturnedEntry>(
      emptyData.returned.map((r: ReturnedEntry) => [r._id, r])
    );

    const allSizes = new Set([...issuedMap.keys(), ...returnedMap.keys()]);
    const emptyReconciliationSummary = Array.from(allSizes).map((size) => {
      const issued = issuedMap.get(size)?.issued || 0;
      const newConnections = issuedMap.get(size)?.newConnections || 0;
      const expected = issued - newConnections;
      const returned = returnedMap.get(size)?.returned || 0;
      return {
        cylinderSize: size,
        issued,
        newConnections,
        expected,
        returned,
        mismatch: expected - returned,
      };
    }).sort((a, b) => a.cylinderSize.localeCompare(b.cylinderSize));

    return NextResponse.json({
      summary,
      staffBreakdown,
      cylinderBreakdown,
      dailyTrends,
      transactionBreakdown,
      newConnectionReport,
      emptyReconciliationSummary,
    });
  } catch (error) {
    console.error("Reports error:", error);
    return NextResponse.json(
      { error: "Failed to fetch report data" },
      { status: 500 }
    );
  }
}
