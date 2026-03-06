import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Inventory } from "@/lib/models/Inventory";
import { Staff } from "@/lib/models/Staff";
import { requireAuth } from "@/lib/auth";

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || "10");

interface SettlementDoc {
  schemaVersion?: number;
  staffEntries?: Array<{
    items: Array<{ cylinderSize: string; quantity: number }>;
    grossRevenue: number;
    totalAddOns: number;
    totalDeductions: number;
    denominationTotal: number;
    cashDifference: number;
    emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  }>;
  items?: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
  grossRevenue?: number;
  totalCredits?: number;
  totalDebits?: number;
  addPayment?: number;
  reducePayment?: number;
  expenses?: number;
  actualCashReceived?: number;
  actualCash?: number;
  amountPending?: number;
  shortage?: number;
  emptyCylindersReturned?: Array<{ cylinderSize: string; quantity: number }>;
}

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");

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

    let totalDeliveries = 0;
    let totalRevenue = 0;
    let totalAddOns = 0;
    let totalDeductions = 0;
    let totalActualCash = 0;
    let totalAmountPending = 0;

    const allItems: Array<{ cylinderSize: string; quantity: number }> = [];
    const allEmpties: Array<{ cylinderSize: string; quantity: number }> = [];

    for (const s of settlements) {
      const doc = s.toObject() as unknown as SettlementDoc;

      if (doc.schemaVersion === 5 && doc.staffEntries) {
        for (const entry of doc.staffEntries) {
          totalDeliveries += entry.items.reduce((a, i) => a + i.quantity, 0);
          totalRevenue += entry.grossRevenue;
          totalAddOns += entry.totalAddOns;
          totalDeductions += entry.totalDeductions;
          totalActualCash += entry.denominationTotal;
          totalAmountPending += Math.max(0, entry.cashDifference);
          allItems.push(...entry.items);
          allEmpties.push(...entry.emptyCylindersReturned);
        }
      } else {
        // V3/legacy
        const items = doc.items || [];
        totalDeliveries += items.reduce((a, i) => a + i.quantity, 0);
        totalRevenue += doc.grossRevenue || 0;
        totalAddOns += doc.totalCredits || doc.addPayment || 0;
        totalDeductions += doc.totalDebits || ((doc.reducePayment || 0) + (doc.expenses || 0));
        totalActualCash += doc.actualCashReceived || doc.actualCash || 0;
        totalAmountPending += doc.amountPending || doc.shortage || 0;
        allItems.push(...items);
        allEmpties.push(...(doc.emptyCylindersReturned || []));
      }
    }

    // Build empty reconciliation
    const issuedMap = new Map<string, number>();
    for (const item of allItems) {
      issuedMap.set(item.cylinderSize, (issuedMap.get(item.cylinderSize) || 0) + item.quantity);
    }
    const returnedMap = new Map<string, number>();
    for (const e of allEmpties) {
      returnedMap.set(e.cylinderSize, (returnedMap.get(e.cylinderSize) || 0) + e.quantity);
    }
    const allSizes = new Set([...issuedMap.keys(), ...returnedMap.keys()]);
    const emptyReconciliation = Array.from(allSizes).map((size) => {
      const issued = issuedMap.get(size) || 0;
      const returned = returnedMap.get(size) || 0;
      return {
        cylinderSize: size,
        issued,
        expected: issued,
        returned,
        mismatch: issued - returned,
      };
    }).sort((a, b) => a.cylinderSize.localeCompare(b.cylinderSize));

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
        totalAddOns,
        totalDeductions,
        totalAmountPending,
        totalActualCash,
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
