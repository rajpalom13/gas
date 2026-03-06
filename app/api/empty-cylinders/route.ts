import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Settlement } from "@/lib/models/Settlement";
import { Inventory } from "@/lib/models/Inventory";
import { requireAuth } from "@/lib/auth";

interface SettlementDoc {
  _id: unknown;
  date: Date;
  schemaVersion?: number;
  staff?: { name: string };
  staffEntries?: Array<{
    staff: { name: string } | unknown;
    items: Array<{ cylinderSize: string; quantity: number }>;
    emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  }>;
  items?: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
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

    const [inventory, daySettlements] = await Promise.all([
      Inventory.find({}).lean(),
      Settlement.find({ date: { $gte: startOfDay, $lte: endOfDay } })
        .populate("staff", "name")
        .populate("staffEntries.staff", "name")
        .lean(),
    ]);

    const inventoryStock = inventory.map((inv) => ({
      cylinderSize: inv.cylinderSize,
      emptyStock: inv.emptyStock,
    }));

    // Aggregate items and empties across all settlements
    const allItems: Array<{ cylinderSize: string; quantity: number }> = [];
    const allEmpties: Array<{ cylinderSize: string; quantity: number }> = [];

    // Build per-settlement breakdown
    const settlements: Array<{
      _id: string;
      staffName: string;
      date: Date;
      emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
      items: Array<{ cylinderSize: string; quantity: number }>;
    }> = [];

    for (const s of daySettlements) {
      const doc = s as unknown as SettlementDoc;

      if (doc.schemaVersion === 5 && doc.staffEntries) {
        // V5: iterate staffEntries, show each as a separate settlement row
        for (const entry of doc.staffEntries) {
          const staffInfo = entry.staff as { name?: string } | null;
          const staffName = staffInfo?.name || "Unknown";
          const items = entry.items || [];
          const empties = entry.emptyCylindersReturned || [];

          allItems.push(...items);
          allEmpties.push(...empties);

          settlements.push({
            _id: String(doc._id) + "-" + staffName,
            staffName,
            date: doc.date,
            emptyCylindersReturned: empties,
            items,
          });
        }
      } else {
        // V3/legacy
        const staffInfo = doc.staff as { name?: string } | null;
        const items = doc.items || [];
        const empties = doc.emptyCylindersReturned || [];

        allItems.push(...items);
        allEmpties.push(...empties);

        settlements.push({
          _id: String(doc._id),
          staffName: staffInfo?.name || "Unknown",
          date: doc.date,
          emptyCylindersReturned: empties,
          items,
        });
      }
    }

    // Build reconciliation: for V5, expected = issued (no DBC subtraction)
    const issuedMap = new Map<string, number>();
    for (const item of allItems) {
      issuedMap.set(item.cylinderSize, (issuedMap.get(item.cylinderSize) || 0) + item.quantity);
    }
    const returnedMap = new Map<string, number>();
    for (const e of allEmpties) {
      returnedMap.set(e.cylinderSize, (returnedMap.get(e.cylinderSize) || 0) + e.quantity);
    }

    const allSizes = new Set([...issuedMap.keys(), ...returnedMap.keys()]);
    const reconciliation = Array.from(allSizes).map((size) => {
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

    // Weekly trend
    const trendStartDate = new Date(istDateStr + "T00:00:00.000+05:30");
    trendStartDate.setDate(trendStartDate.getDate() - 6);

    const weekSettlements = await Settlement.find({
      date: { $gte: trendStartDate, $lte: endOfDay },
    }).lean();

    const trendMap = new Map<string, { totalIssued: number; totalReturned: number }>();

    for (let i = 0; i < 7; i++) {
      const d = new Date(istDateStr + "T12:00:00.000+05:30");
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split("T")[0];
      trendMap.set(key, { totalIssued: 0, totalReturned: 0 });
    }

    for (const s of weekSettlements) {
      const doc = s as unknown as SettlementDoc;
      const sDate = new Date(doc.date);
      const istDate = new Date(sDate.getTime() + istOffset);
      const dateKey = istDate.toISOString().split("T")[0];

      const entry = trendMap.get(dateKey);
      if (!entry) continue;

      if (doc.schemaVersion === 5 && doc.staffEntries) {
        for (const se of doc.staffEntries) {
          entry.totalIssued += se.items.reduce((sum, i) => sum + i.quantity, 0);
          entry.totalReturned += se.emptyCylindersReturned.reduce((sum, e) => sum + e.quantity, 0);
        }
      } else {
        const items = doc.items || [];
        const empties = doc.emptyCylindersReturned || [];
        entry.totalIssued += items.reduce((sum, i) => sum + i.quantity, 0);
        entry.totalReturned += empties.reduce((sum, e) => sum + e.quantity, 0);
      }
    }

    const weeklyTrend = Array.from(trendMap.entries()).map(([date, data]) => ({
      date,
      totalIssued: data.totalIssued,
      totalReturned: data.totalReturned,
      totalMismatch: data.totalIssued - data.totalReturned,
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
