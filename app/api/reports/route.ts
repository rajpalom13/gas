import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { requireAuth } from "@/lib/auth";

// Pre-processing stage: flatten V5 staffEntries into top-level fields for unified aggregation
const flattenStage = [
  {
    $addFields: {
      _flatItems: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this.items"] },
            },
          },
          else: "$items",
        },
      },
      _flatGrossRevenue: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.grossRevenue"] },
            },
          },
          else: "$grossRevenue",
        },
      },
      _flatTotalAddOns: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.totalAddOns"] },
            },
          },
          else: { $ifNull: ["$totalCredits", "$addPayment"] },
        },
      },
      _flatTotalDeductions: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.totalDeductions"] },
            },
          },
          else: {
            $ifNull: [
              "$totalDebits",
              { $add: [{ $ifNull: ["$reducePayment", 0] }, { $ifNull: ["$expenses", 0] }] },
            ],
          },
        },
      },
      _flatActualCash: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.denominationTotal"] },
            },
          },
          else: { $ifNull: ["$actualCashReceived", "$actualCash"] },
        },
      },
      _flatAmountPending: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  { $max: [0, "$$this.cashDifference"] },
                ],
              },
            },
          },
          else: { $ifNull: ["$amountPending", "$shortage"] },
        },
      },
      _flatStaff: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: { $arrayElemAt: ["$staffEntries.staff", 0] },
          else: "$staff",
        },
      },
      _flatEmptyCylindersReturned: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this.emptyCylindersReturned"] },
            },
          },
          else: "$emptyCylindersReturned",
        },
      },
      _flatAddOns: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this.addOns"] },
            },
          },
          else: [],
        },
      },
      _flatDeductions: {
        $cond: {
          if: { $eq: ["$schemaVersion", 5] },
          then: {
            $reduce: {
              input: "$staffEntries",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this.deductions"] },
            },
          },
          else: [],
        },
      },
    },
  },
];

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(new Date().setDate(endDate.getDate() - 30));
    startDate.setHours(0, 0, 0, 0);

    const dateFilter = { date: { $gte: startDate, $lte: endDate } };

    const [
      summaryResult,
      staffBreakdownRaw,
      cylinderBreakdown,
      dailyTrends,
      addonDeductionBreakdown,
      emptyReconciliation,
    ] = await Promise.all([
      // Summary
      Settlement.aggregate([
        { $match: dateFilter },
        ...flattenStage,
        {
          $group: {
            _id: null,
            totalSettlements: { $sum: 1 },
            totalRevenue: { $sum: "$_flatGrossRevenue" },
            totalActualCash: { $sum: "$_flatActualCash" },
            totalDeliveries: { $sum: { $sum: "$_flatItems.quantity" } },
            totalAddOns: { $sum: "$_flatTotalAddOns" },
            totalDeductions: { $sum: "$_flatTotalDeductions" },
            totalAmountPending: { $sum: "$_flatAmountPending" },
          },
        },
      ]),

      // Staff breakdown - V5 needs unwinding staffEntries, V3 uses flat staff
      Settlement.aggregate([
        { $match: dateFilter },
        // For V5: unwind staffEntries to get per-staff data
        // For V3: wrap into a synthetic staffEntries-like structure
        {
          $addFields: {
            _staffRows: {
              $cond: {
                if: { $eq: ["$schemaVersion", 5] },
                then: "$staffEntries",
                else: [
                  {
                    staff: "$staff",
                    items: "$items",
                    grossRevenue: "$grossRevenue",
                    totalAddOns: { $ifNull: ["$totalCredits", "$addPayment"] },
                    totalDeductions: {
                      $ifNull: [
                        "$totalDebits",
                        { $add: [{ $ifNull: ["$reducePayment", 0] }, { $ifNull: ["$expenses", 0] }] },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
        { $unwind: "$_staffRows" },
        {
          $group: {
            _id: "$_staffRows.staff",
            settlementCount: { $sum: 1 },
            totalRevenue: { $sum: "$_staffRows.grossRevenue" },
            totalDeliveries: { $sum: { $sum: "$_staffRows.items.quantity" } },
            totalAddOns: { $sum: "$_staffRows.totalAddOns" },
            totalDeductions: { $sum: "$_staffRows.totalDeductions" },
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
            totalDeliveries: 1,
            totalAddOns: 1,
            totalDeductions: 1,
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Cylinder breakdown
      Settlement.aggregate([
        { $match: dateFilter },
        ...flattenStage,
        { $unwind: "$_flatItems" },
        {
          $group: {
            _id: "$_flatItems.cylinderSize",
            totalQuantity: { $sum: "$_flatItems.quantity" },
            totalRevenue: { $sum: "$_flatItems.total" },
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
        ...flattenStage,
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            revenue: { $sum: "$_flatGrossRevenue" },
            deliveries: { $sum: { $sum: "$_flatItems.quantity" } },
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

      // Add On / Deduction breakdown (replaces transaction breakdown)
      // V5: unwind addOns/deductions from staffEntries
      // V3: unwind transactions and remap
      Settlement.aggregate([
        { $match: dateFilter },
        ...flattenStage,
        {
          $facet: {
            v5addOns: [
              { $match: { "_flatAddOns.0": { $exists: true } } },
              { $unwind: "$_flatAddOns" },
              {
                $group: {
                  _id: { category: "$_flatAddOns.category", type: { $literal: "addon" } },
                  totalAmount: { $sum: "$_flatAddOns.amount" },
                  count: { $sum: 1 },
                },
              },
            ],
            v5deductions: [
              { $match: { "_flatDeductions.0": { $exists: true } } },
              { $unwind: "$_flatDeductions" },
              {
                $group: {
                  _id: { category: "$_flatDeductions.category", type: { $literal: "deduction" } },
                  totalAmount: { $sum: "$_flatDeductions.amount" },
                  count: { $sum: 1 },
                },
              },
            ],
            v3transactions: [
              { $match: { "transactions.0": { $exists: true }, schemaVersion: { $ne: 5 } } },
              { $unwind: "$transactions" },
              {
                $group: {
                  _id: {
                    category: "$transactions.category",
                    type: {
                      $cond: {
                        if: { $eq: ["$transactions.type", "credit"] },
                        then: "addon",
                        else: "deduction",
                      },
                    },
                  },
                  totalAmount: { $sum: "$transactions.amount" },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),

      // Empty reconciliation
      Settlement.aggregate([
        { $match: dateFilter },
        ...flattenStage,
        {
          $facet: {
            issued: [
              { $unwind: "$_flatItems" },
              {
                $group: {
                  _id: "$_flatItems.cylinderSize",
                  issued: { $sum: "$_flatItems.quantity" },
                },
              },
            ],
            returned: [
              { $unwind: "$_flatEmptyCylindersReturned" },
              {
                $group: {
                  _id: "$_flatEmptyCylindersReturned.cylinderSize",
                  returned: { $sum: "$_flatEmptyCylindersReturned.quantity" },
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
      totalActualCash: 0,
      totalDeliveries: 0,
      totalAddOns: 0,
      totalDeductions: 0,
      totalAmountPending: 0,
    };

    // Merge addon/deduction breakdown from facet
    const adData = addonDeductionBreakdown[0] || { v5addOns: [], v5deductions: [], v3transactions: [] };
    const breakdownMap = new Map<string, { category: string; type: string; totalAmount: number; count: number }>();

    for (const entry of [...adData.v5addOns, ...adData.v5deductions, ...adData.v3transactions]) {
      const key = `${entry._id.category}:${entry._id.type}`;
      const existing = breakdownMap.get(key);
      if (existing) {
        existing.totalAmount += entry.totalAmount;
        existing.count += entry.count;
      } else {
        breakdownMap.set(key, {
          category: entry._id.category,
          type: entry._id.type,
          totalAmount: entry.totalAmount,
          count: entry.count,
        });
      }
    }
    const addonDeductionList = Array.from(breakdownMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === "addon" ? -1 : 1;
      return b.totalAmount - a.totalAmount;
    });

    // Process empty reconciliation
    interface IssuedEntry { _id: string; issued: number }
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
      const returned = returnedMap.get(size)?.returned || 0;
      return {
        cylinderSize: size,
        issued,
        expected: issued,
        returned,
        mismatch: issued - returned,
      };
    }).sort((a, b) => a.cylinderSize.localeCompare(b.cylinderSize));

    return NextResponse.json({
      summary,
      staffBreakdown: staffBreakdownRaw,
      cylinderBreakdown,
      dailyTrends,
      addonDeductionBreakdown: addonDeductionList,
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
