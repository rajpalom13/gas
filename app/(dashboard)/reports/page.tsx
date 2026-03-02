"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  FileText,
  PackagePlus,
  IndianRupee,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

interface ReportSummary {
  totalSettlements: number;
  totalRevenue: number;
  totalCredits: number;
  totalDebits: number;
  totalAmountPending: number;
  totalNewConnections: number;
  totalActualCash: number;
  totalDeliveries: number;
  // Legacy fallbacks
  totalExpenses?: number;
  totalShortage?: number;
}

interface StaffBreakdownItem {
  staffId: string;
  staffName: string;
  settlementCount: number;
  totalRevenue: number;
  totalCredits: number;
  totalDebits: number;
  totalAmountPending: number;
  totalDeliveries: number;
  // Legacy fallbacks
  totalExpenses?: number;
  totalShortage?: number;
}

interface CylinderBreakdownItem {
  cylinderSize: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface DailyTrendItem {
  date: string;
  revenue: number;
  deliveries: number;
  settlements: number;
}

interface TransactionBreakdownItem {
  category: string;
  type: string;
  totalAmount: number;
  count: number;
}

interface NewConnectionItem {
  cylinderSize: string;
  count: number;
}

interface EmptyReconciliationItem {
  cylinderSize: string;
  totalIssued: number;
  totalNewConnections: number;
  totalExpected: number;
  totalReturned: number;
  totalMismatch: number;
}

interface ReportData {
  summary: ReportSummary;
  staffBreakdown: StaffBreakdownItem[];
  cylinderBreakdown: CylinderBreakdownItem[];
  dailyTrends: DailyTrendItem[];
  transactionBreakdown?: TransactionBreakdownItem[];
  newConnectionReport?: NewConnectionItem[];
  emptyReconciliation?: EmptyReconciliationItem[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatDateStr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toInputDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

  const [startDate, setStartDate] = useState(toInputDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(toInputDate(today));

  const fetchReport = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports?startDate=${start}&endDate=${end}`
      );
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(startDate, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    fetchReport(startDate, endDate);
  };

  const setPreset = (preset: "today" | "7days" | "30days" | "thisMonth") => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (preset) {
      case "today":
        start = now;
        break;
      case "7days":
        start = new Date(new Date().setDate(now.getDate() - 7));
        break;
      case "30days":
        start = new Date(new Date().setDate(now.getDate() - 30));
        break;
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const s = toInputDate(start);
    const e = toInputDate(end);
    setStartDate(s);
    setEndDate(e);
    fetchReport(s, e);
  };

  const exportCSV = () => {
    if (!data) return;

    const headers = [
      "Date",
      "Staff",
      "Cylinder Sizes",
      "Revenue",
      "Credits",
      "Debits",
      "Actual Cash",
      "Amount Pending",
    ];

    const rows: string[][] = [];

    // Add staff summary rows
    rows.push(["--- Staff Summary ---", "", "", "", "", "", "", ""]);
    data.staffBreakdown.forEach((staff) => {
      rows.push([
        "",
        staff.staffName,
        `${staff.totalDeliveries} cylinders`,
        staff.totalRevenue.toString(),
        (staff.totalCredits ?? 0).toString(),
        (staff.totalDebits ?? staff.totalExpenses ?? 0).toString(),
        "",
        (staff.totalAmountPending ?? staff.totalShortage ?? 0).toString(),
      ]);
    });

    // Add daily trends
    rows.push(["", "", "", "", "", "", "", ""]);
    rows.push(["--- Daily Trends ---", "", "", "", "", "", "", ""]);
    data.dailyTrends.forEach((day) => {
      rows.push([
        day.date,
        "",
        `${day.deliveries} deliveries`,
        day.revenue.toString(),
        "",
        "",
        "",
        "",
      ]);
    });

    // Add cylinder breakdown
    rows.push(["", "", "", "", "", "", "", ""]);
    rows.push(["--- Cylinder Breakdown ---", "", "", "", "", "", "", ""]);
    data.cylinderBreakdown.forEach((cyl) => {
      rows.push([
        "",
        "",
        `${cyl.cylinderSize} x ${cyl.totalQuantity}`,
        cyl.totalRevenue.toString(),
        "",
        "",
        "",
        "",
      ]);
    });

    // Add transaction breakdown
    if (data.transactionBreakdown && data.transactionBreakdown.length > 0) {
      rows.push(["", "", "", "", "", "", "", ""]);
      rows.push(["--- Transaction Breakdown ---", "", "", "", "", "", "", ""]);
      rows.push(["Category", "Type", "", "Total Amount", "Count", "", "", ""]);
      data.transactionBreakdown.forEach((t) => {
        rows.push([
          t.category,
          t.type,
          "",
          t.totalAmount.toString(),
          t.count.toString(),
          "",
          "",
          "",
        ]);
      });
    }

    // Add new connections
    if (data.newConnectionReport && data.newConnectionReport.length > 0) {
      rows.push(["", "", "", "", "", "", "", ""]);
      rows.push(["--- New Connections (DBC) ---", "", "", "", "", "", "", ""]);
      data.newConnectionReport.forEach((nc) => {
        rows.push([
          "",
          "",
          `${nc.cylinderSize} x ${nc.count}`,
          "",
          "",
          "",
          "",
          "",
        ]);
      });
    }

    // Add summary row
    rows.push(["", "", "", "", "", "", "", ""]);
    rows.push([
      "TOTAL",
      "",
      `${data.summary.totalDeliveries} deliveries`,
      data.summary.totalRevenue.toString(),
      (data.summary.totalCredits ?? 0).toString(),
      (data.summary.totalDebits ?? data.summary.totalExpenses ?? 0).toString(),
      data.summary.totalActualCash.toString(),
      (data.summary.totalAmountPending ?? data.summary.totalShortage ?? 0).toString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report_${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;

  const statCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(summary?.totalRevenue || 0),
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      title: "Total Credits",
      value: formatCurrency(summary?.totalCredits || 0),
      icon: IndianRupee,
      color: "text-sky-600",
      bg: "bg-sky-50 dark:bg-sky-900/20",
    },
    {
      title: "Total Debits",
      value: formatCurrency(summary?.totalDebits ?? summary?.totalExpenses ?? 0),
      icon: TrendingDown,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      title: "Amount Pending",
      value: formatCurrency(summary?.totalAmountPending ?? summary?.totalShortage ?? 0),
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-900/20",
    },
    {
      title: "New Connections",
      value: summary?.totalNewConnections || 0,
      suffix: "DBC",
      icon: PackagePlus,
      color: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
    {
      title: "Total Deliveries",
      value: summary?.totalDeliveries || 0,
      suffix: "cylinders",
      icon: Package,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Total Settlements",
      value: summary?.totalSettlements || 0,
      suffix: "records",
      icon: FileText,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Settlement reports and analytics
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Settlement reports and analytics
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate" className="text-sm">
                  Start Date
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="pl-10 w-[170px]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate" className="text-sm">
                  End Date
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="pl-10 w-[170px]"
                  />
                </div>
              </div>
              <Button onClick={handleApply} className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Apply
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreset("today")}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreset("7days")}
              >
                Last 7 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreset("30days")}
              >
                Last 30 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreset("thisMonth")}
              >
                This Month
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {statCards.map((card) => (
          <motion.div key={card.title} variants={itemVariants}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                    {"suffix" in card && card.suffix && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {card.suffix}
                      </p>
                    )}
                  </div>
                  <div className={`${card.bg} p-3 rounded-xl`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Staff Performance Table */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.staffBreakdown && data.staffBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Settlements</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">Debits</TableHead>
                      <TableHead className="text-right">Amount Pending</TableHead>
                      <TableHead className="text-right">Deliveries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.staffBreakdown.map((staff) => (
                      <TableRow key={staff.staffId}>
                        <TableCell className="font-medium">
                          {staff.staffName}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {staff.settlementCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">
                          {formatCurrency(staff.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-sky-600">
                          {formatCurrency(staff.totalCredits ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-amber-600">
                          {formatCurrency(staff.totalDebits ?? staff.totalExpenses ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(staff.totalAmountPending ?? staff.totalShortage ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {staff.totalDeliveries}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-8">
                No staff data for the selected period.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Transaction Category Breakdown */}
      {data?.transactionBreakdown && data.transactionBreakdown.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactionBreakdown.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{t.category}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === "credit" ? "success" : "destructive"}>
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(t.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{t.count}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* New Connections Report */}
      {data?.newConnectionReport && data.newConnectionReport.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Connections (DBC)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {data.newConnectionReport.map((nc) => (
                  <div
                    key={nc.cylinderSize}
                    className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {nc.cylinderSize}
                      </p>
                      <PackagePlus className="h-4 w-4 text-indigo-600" />
                    </div>
                    <p className="text-2xl font-bold text-indigo-600">{nc.count}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">new connections</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty Reconciliation Report */}
      {data?.emptyReconciliation && data.emptyReconciliation.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empty Cylinder Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cylinder Size</TableHead>
                      <TableHead className="text-right">Total Issued</TableHead>
                      <TableHead className="text-right">Total DBC</TableHead>
                      <TableHead className="text-right">Expected Empties</TableHead>
                      <TableHead className="text-right">Total Returned</TableHead>
                      <TableHead className="text-right">Total Mismatch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.emptyReconciliation.map((item) => (
                      <TableRow
                        key={item.cylinderSize}
                        className={item.totalMismatch !== 0 ? "bg-red-50/50 dark:bg-red-900/10" : ""}
                      >
                        <TableCell className="font-medium">{item.cylinderSize}</TableCell>
                        <TableCell className="text-right">{item.totalIssued}</TableCell>
                        <TableCell className="text-right">{item.totalNewConnections}</TableCell>
                        <TableCell className="text-right">{item.totalExpected}</TableCell>
                        <TableCell className="text-right">{item.totalReturned}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={item.totalMismatch !== 0 ? "destructive" : "success"}>
                            {item.totalMismatch}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cylinder Distribution */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cylinder Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.cylinderBreakdown && data.cylinderBreakdown.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {data.cylinderBreakdown.map((cyl) => {
                  const maxQty = Math.max(
                    ...data.cylinderBreakdown.map((c) => c.totalQuantity),
                    1
                  );
                  const pct = (cyl.totalQuantity / maxQty) * 100;

                  return (
                    <div
                      key={cyl.cylinderSize}
                      className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                          {cyl.cylinderSize}
                        </p>
                        <Badge variant="outline">{cyl.totalQuantity} qty</Badge>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-sm font-medium text-emerald-600">
                        {formatCurrency(cyl.totalRevenue)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-8">
                No cylinder data for the selected period.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Daily Trends */}
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.dailyTrends && data.dailyTrends.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Deliveries</TableHead>
                      <TableHead className="text-right">Settlements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dailyTrends.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell className="font-medium">
                          {formatDateStr(day.date)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-medium">
                          {formatCurrency(day.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {day.deliveries}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{day.settlements}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-8">
                No daily data for the selected period.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
