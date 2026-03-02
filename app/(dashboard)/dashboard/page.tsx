"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Package, TrendingUp, TrendingDown, AlertTriangle, Users, IndianRupee, ChevronLeft, ChevronRight, Calendar, PackagePlus, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { sectionThemes, buildCylinderColorMap } from "@/lib/theme";

interface DashboardData {
  stats: {
    totalDeliveries: number;
    totalRevenue: number;
    totalCredits: number;
    totalDebits: number;
    totalNewConnections: number;
    totalAmountPending: number;
    totalActualCash: number;
    staffCount: number;
    totalDebt: number;
    // Legacy fallbacks
    totalExpenses?: number;
    totalShortage?: number;
  };
  inventory: Array<{
    cylinderSize: string;
    fullStock: number;
    emptyStock: number;
    pricePerUnit: number;
  }>;
  emptyReconciliation?: Array<{
    cylinderSize: string;
    issued: number;
    newConnections: number;
    expected: number;
    returned: number;
    mismatch: number;
  }>;
  recentSettlements: Array<{
    _id: string;
    staff: { name: string };
    date: string;
    grossRevenue: number;
    shortage: number;
    amountPending?: number;
  }>;
  lowStockAlerts: Array<{
    cylinderSize: string;
    fullStock: number;
    threshold: number;
  }>;
  date: string;
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split("T")[0];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayIST());

  const fetchData = (date: string) => {
    setLoading(true);
    fetch(`/api/dashboard?date=${date}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const isToday = selectedDate === getTodayIST();

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<LayoutDashboard className="h-5 w-5" />}
          title="Dashboard"
          subtitle="Daily overview and statistics"
          gradient={sectionThemes.dashboard.gradient}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  const statCards = [
    {
      title: "Total Deliveries",
      value: stats?.totalDeliveries || 0,
      suffix: "cylinders",
      icon: Package,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats?.totalRevenue || 0),
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      title: "Total Debits",
      value: formatCurrency(stats?.totalDebits ?? stats?.totalExpenses ?? 0),
      icon: TrendingDown,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      title: "Amount Pending",
      value: formatCurrency(stats?.totalAmountPending ?? stats?.totalShortage ?? 0),
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-900/20",
    },
    {
      title: "New Connections",
      value: stats?.totalNewConnections || 0,
      suffix: "DBC",
      icon: PackagePlus,
      color: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-900/20",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title="Dashboard"
        subtitle={`${isToday ? "Today's" : ""} overview \u2014 ${formatDisplayDate(selectedDate)}`}
        gradient={sectionThemes.dashboard.gradient}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 w-[170px]"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(getTodayIST())}>
                Today
              </Button>
            )}
          </div>
        }
      />

      {/* Low Stock Alerts */}
      {data?.lowStockAlerts && data.lowStockAlerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">Low Stock Alert</p>
                  <div className="mt-1 space-y-1">
                    {data.lowStockAlerts.map((alert) => (
                      <p key={alert.cylinderSize} className="text-sm text-amber-700 dark:text-amber-300">
                        {alert.cylinderSize}: Only <span className="font-bold">{alert.fullStock}</span> full cylinders remaining (threshold: {alert.threshold})
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        {statCards.map((card) => (
          <motion.div key={card.title} variants={fadeUpItem}>
            <StatCard
              icon={<card.icon className="h-5 w-5" />}
              label={card.title}
              value={card.suffix ? `${card.value} ${card.suffix}` : card.value}
              iconBg={card.bg}
              iconColor={card.color}
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <motion.div variants={fadeUpItem}>
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Active Staff"
            value={stats?.staffCount || 0}
            iconBg="bg-violet-50 dark:bg-violet-900/20"
            iconColor="text-violet-600"
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <StatCard
            icon={<IndianRupee className="h-5 w-5" />}
            label="Cash Collected"
            value={formatCurrency(stats?.totalActualCash || 0)}
            iconBg="bg-sky-50 dark:bg-sky-900/20"
            iconColor="text-sky-600"
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Total Staff Debt"
            value={formatCurrency(stats?.totalDebt || 0)}
            iconBg="bg-rose-50 dark:bg-rose-900/20"
            iconColor="text-rose-600"
          />
        </motion.div>
      </motion.div>

      {/* Inventory Overview */}
      <motion.div variants={fadeUpItem} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(() => {
                const sizes = data?.inventory.map((i) => i.cylinderSize) || [];
                const colorMap = buildCylinderColorMap(sizes);
                return data?.inventory.map((item) => {
                const lowAlert = data?.lowStockAlerts?.find((a) => a.cylinderSize === item.cylinderSize);
                const cylColor = colorMap[item.cylinderSize];
                return (
                  <div
                    key={item.cylinderSize}
                    className={`rounded-lg border p-4 border-l-4 ${cylColor?.border || ""} ${
                      lowAlert
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
                        : cylColor?.bg || "border-zinc-100 dark:border-zinc-800"
                    }`}
                  >
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {item.cylinderSize} Cylinder
                      {lowAlert && <span className="text-amber-600 ml-1 text-xs">(Low)</span>}
                    </p>
                    <div className="mt-2 flex items-center gap-4">
                      <div>
                        <p className="text-xs text-zinc-500">Full</p>
                        <p className={`text-lg font-bold ${lowAlert ? "text-amber-600" : "text-emerald-600"}`}>{item.fullStock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Empty</p>
                        <p className="text-lg font-bold text-amber-600">{item.emptyStock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Price</p>
                        <p className="text-lg font-bold">{formatCurrency(item.pricePerUnit)}</p>
                      </div>
                    </div>
                  </div>
                );
              });
              })()}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Empty Cylinder Reconciliation */}
      {data?.emptyReconciliation && data.emptyReconciliation.length > 0 && (
        <motion.div variants={fadeUpItem} initial="hidden" animate="show">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Empty Cylinder Reconciliation</CardTitle>
              <Link href="/empty-cylinders" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
                View Details →
              </Link>
            </CardHeader>
            <CardContent>
              {/* Mobile card view */}
              <div className="block sm:hidden space-y-3">
                {data.emptyReconciliation.map((item) => (
                  <div
                    key={item.cylinderSize}
                    className={`rounded-lg border p-4 ${
                      item.mismatch !== 0
                        ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10"
                        : "border-zinc-100 dark:border-zinc-800"
                    }`}
                  >
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                      {item.cylinderSize}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="text-xs text-zinc-500">Issued</p>
                        <p className="font-semibold">{item.issued}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">DBC</p>
                        <p className="font-semibold">{item.newConnections}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Expected</p>
                        <p className="font-semibold">{item.expected}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-sm mt-2">
                      <div>
                        <p className="text-xs text-zinc-500">Returned</p>
                        <p className="font-semibold">{item.returned}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Mismatch</p>
                        <Badge variant={item.mismatch !== 0 ? "destructive" : "success"} className="text-sm font-bold mt-0.5">
                          {item.mismatch}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="text-left py-2 px-3 font-medium text-zinc-500">Cylinder Size</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500">Issued</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500">DBC</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500">Expected Empties</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500">Returned</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500">Mismatch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.emptyReconciliation.map((item) => (
                      <tr
                        key={item.cylinderSize}
                        className={`border-b border-zinc-100 dark:border-zinc-800 ${
                          item.mismatch !== 0 ? "bg-red-50/50 dark:bg-red-900/10" : ""
                        }`}
                      >
                        <td className="py-2 px-3 font-medium">{item.cylinderSize}</td>
                        <td className="text-right py-2 px-3">{item.issued}</td>
                        <td className="text-right py-2 px-3">{item.newConnections}</td>
                        <td className="text-right py-2 px-3">{item.expected}</td>
                        <td className="text-right py-2 px-3">{item.returned}</td>
                        <td className="text-right py-2 px-3">
                          <Badge variant={item.mismatch !== 0 ? "destructive" : "success"} className="text-sm font-bold">
                            {item.mismatch}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
