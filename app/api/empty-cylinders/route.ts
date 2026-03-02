import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Inventory } from "@/lib/models/Inventory";
import { requireAuth } from "@/lib/auth";
import { normalizeSettlement, computeEmptyReconciliation } from "@/lib/settlement-utils";

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

    // Fetch inventory and settlements for the given date
    const [inventory, daySettlements] = await Promise.all([
      Inventory.find({}).lean(),
      Settlement.find({ date: { $gte: startOfDay, $lte: endOfDay } })
        .populate("staff", "name")
        .lean(),
    ]);

    // Build inventoryStock response
    const inventoryStock = inventory.map((inv) => ({
      cylinderSize: inv.cylinderSize,
      emptyStock: inv.emptyStock,
    }));

    // Normalize all settlements to V3 format
    const normalized = daySettlements.map((s) => {
      const doc = s as unknown as Record<string, unknown>;
      return normalizeSettlement(doc);
    });

    // Aggregate items and empties across all settlements for reconciliation
    const allItems: Array<{ cylinderSize: string; quantity: number; pricePerUnit: number; total: number; isNewConnection?: boolean }> = [];
    const allEmpties: Array<{ cylinderSize: string; quantity: number }> = [];

    for (const s of normalized) {
      const items = s.items as Array<{ cylinderSize: string; quantity: number; pricePerUnit: number; total: number; isNewConnection?: boolean }>;
      const empties = s.emptyCylindersReturned as Array<{ cylinderSize: string; quantity: number }>;
      allItems.push(...items);
      allEmpties.push(...empties);
    }

    const reconciliation = computeEmptyReconciliation(allItems, allEmpties);

    // Build per-settlement breakdown
    const settlements = daySettlements.map((s) => {
      const doc = s as unknown as Record<string, unknown>;
      const norm = normalizeSettlement(doc);
      const staff = s.staff as unknown as { name: string };
      return {
        _id: String(s._id),
        staffName: staff?.name || "Unknown",
        date: s.date,
        emptyCylindersReturned: norm.emptyCylindersReturned as Array<{ cylinderSize: string; quantity: number }>,
        items: norm.items as Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>,
      };
    });

    // Weekly trend: last 7 days ending on the given date
    const trendStartDate = new Date(istDateStr + "T00:00:00.000+05:30");
    trendStartDate.setDate(trendStartDate.getDate() - 6);

    const weekSettlements = await Settlement.find({
      date: { $gte: trendStartDate, $lte: endOfDay },
    }).lean();

    // Group by date (IST)
    const trendMap = new Map<string, { totalIssued: number; totalReturned: number; totalExpected: number }>();

    // Initialize all 7 days
    for (let i = 0; i < 7; i++) {
      const d = new Date(istDateStr + "T12:00:00.000+05:30");
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split("T")[0];
      trendMap.set(key, { totalIssued: 0, totalReturned: 0, totalExpected: 0 });
    }

    for (const s of weekSettlements) {
      const doc = s as unknown as Record<string, unknown>;
      const norm = normalizeSettlement(doc);

      // Get date key in IST
      const sDate = new Date(s.date);
      const istDate = new Date(sDate.getTime() + istOffset);
      const dateKey = istDate.toISOString().split("T")[0];

      const entry = trendMap.get(dateKey);
      if (!entry) continue;

      const items = norm.items as Array<{ quantity: number; isNewConnection?: boolean }>;
      const empties = norm.emptyCylindersReturned as Array<{ quantity: number }>;

      const issued = items.reduce((sum, i) => sum + i.quantity, 0);
      const newConns = items.filter((i) => i.isNewConnection).reduce((sum, i) => sum + i.quantity, 0);
      const returned = empties.reduce((sum, e) => sum + e.quantity, 0);

      entry.totalIssued += issued;
      entry.totalReturned += returned;
      entry.totalExpected += issued - newConns;
    }

    const weeklyTrend = Array.from(trendMap.entries()).map(([date, data]) => ({
      date,
      totalIssued: data.totalIssued,
      totalReturned: data.totalReturned,
      totalMismatch: data.totalExpected - data.totalReturned,
    }));

    return NextResponse.json({
      inventoryStock,
      reconciliation,
      settlements,
      weeklyTrend,
      date: istDateStr,
    });
  } catch (error) {
    console.error("Empty cylinders error:", error);
    return NextResponse.json({ error: "Failed to fetch empty cylinder data" }, { status: 500 });
  }
}
