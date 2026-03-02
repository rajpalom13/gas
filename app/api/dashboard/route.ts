import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Inventory } from "@/lib/models/Inventory";
import { Staff } from "@/lib/models/Staff";
import { requireAuth } from "@/lib/auth";
import { normalizeSettlement, computeEmptyReconciliation } from "@/lib/settlement-utils";

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || "10");

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

    // Use IST timezone for date calculations
    const istOffset = 5.5 * 60 * 60 * 1000;
    let istDateStr: string;

    if (dateParam) {
      istDateStr = dateParam;
    } else {
      const now = new Date();
      const istNow = new Date(now.getTime() + istOffset);
      istDateStr = istNow.toISOString().split("T")[0];
    }

    const startOfDay = new Date(istDateStr + "T00:00:00.000+05:30");
    const endOfDay = new Date(istDateStr + "T23:59:59.999+05:30");

    const [settlements, inventory, staffCount, totalDebt] = await Promise.all([
      Settlement.find({ date: { $gte: startOfDay, $lte: endOfDay } }).populate("staff", "name"),
      Inventory.find({}).lean(),
      Staff.countDocuments({ isActive: true }),
      Staff.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, total: { $sum: "$debtBalance" } } }]),
    ]);

    // Normalize all settlements to V3 format for consistent stats
    const normalized = settlements.map((s) => {
      const doc = s.toObject() as unknown as Record<string, unknown>;
      return normalizeSettlement(doc);
    });

    const totalDeliveries = normalized.reduce(
      (acc, s) => acc + ((s.items as Array<{ quantity: number }>).reduce((a, i) => a + i.quantity, 0)),
      0
    );
    const totalRevenue = normalized.reduce((acc, s) => acc + (s.grossRevenue as number), 0);
    const totalExpenses = normalized.reduce((acc, s) => acc + (s.totalDebits as number), 0);
    const totalShortage = normalized.reduce((acc, s) => acc + (s.amountPending as number), 0);
    const totalActualCash = normalized.reduce((acc, s) => acc + (s.actualCashReceived as number), 0);
    const totalCredits = normalized.reduce((acc, s) => acc + (s.totalCredits as number), 0);
    const totalDebits = normalized.reduce((acc, s) => acc + (s.totalDebits as number), 0);
    const totalAmountPending = normalized.reduce((acc, s) => acc + (s.amountPending as number), 0);

    // Count new connections
    const totalNewConnections = normalized.reduce((acc, s) => {
      const items = s.items as Array<{ quantity: number; isNewConnection?: boolean }>;
      return acc + items.filter((i) => i.isNewConnection).reduce((a, i) => a + i.quantity, 0);
    }, 0);

    // Empty reconciliation: aggregate per cylinder size across all settlements
    const allItems: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }> = [];
    const allEmpties: Array<{ cylinderSize: string; quantity: number }> = [];

    for (const s of normalized) {
      const items = s.items as Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
      const empties = s.emptyCylindersReturned as Array<{ cylinderSize: string; quantity: number }>;
      allItems.push(...items);
      allEmpties.push(...empties);
    }

    const emptyReconciliation = computeEmptyReconciliation(
      allItems.map((i) => ({
        cylinderSize: i.cylinderSize,
        quantity: i.quantity,
        pricePerUnit: 0,
        total: 0,
        isNewConnection: i.isNewConnection,
      })),
      allEmpties
    );

    // Low stock alerts
    const lowStockAlerts = inventory
      .filter((item) => item.fullStock < LOW_STOCK_THRESHOLD)
      .map((item) => ({
        cylinderSize: item.cylinderSize,
        fullStock: item.fullStock,
        threshold: LOW_STOCK_THRESHOLD,
      }));

    return NextResponse.json({
      stats: {
        totalDeliveries,
        totalRevenue,
        totalExpenses,
        totalShortage,
        totalActualCash,
        totalCredits,
        totalDebits,
        totalNewConnections,
        totalAmountPending,
        staffCount,
        totalDebt: totalDebt[0]?.total || 0,
      },
      inventory,
      recentSettlements: settlements.slice(0, 10),
      lowStockAlerts,
      emptyReconciliation,
      date: istDateStr,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
