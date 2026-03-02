"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar, CircleDashed, Package, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes, getCylinderColor } from "@/lib/theme";

interface EmptyCylindersData {
  inventoryStock: Array<{ cylinderSize: string; emptyStock: number }>;
  reconciliation: Array<{
    cylinderSize: string;
    issued: number;
    newConnections: number;
    expected: number;
    returned: number;
    mismatch: number;
  }>;
  settlements: Array<{
    _id: string;
    staffName: string;
    date: string;
    emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
    items: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
  }>;
  weeklyTrend: Array<{
    date: string;
    totalIssued: number;
    totalReturned: number;
    totalMismatch: number;
  }>;
  date: string;
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split("T")[0];
}

export default function EmptyCylindersPage() {
  const [data, setData] = useState<EmptyCylindersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayIST());

  const fetchData = (date: string) => {
    setLoading(true);
    fetch(`/api/empty-cylinders?date=${date}`)
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

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<RotateCcw className="h-5 w-5" />}
          title="Empty Cylinders"
          subtitle="Track and reconcile empty cylinder returns"
          gradient={sectionThemes.emptyCylinders.gradient}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<RotateCcw className="h-5 w-5" />}
        title="Empty Cylinders"
        subtitle={`${isToday ? "Today's" : ""} empty cylinder tracking \u2014 ${formatDisplayDate(selectedDate)}`}
        gradient={sectionThemes.emptyCylinders.gradient}
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

      {/* Section 1: Current Empty Stock */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDashed className="h-4 w-4" />
              Current Empty Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data?.inventoryStock.map((item, idx) => {
                const cylColor = getCylinderColor(idx);
                return (
                <motion.div key={item.cylinderSize} variants={fadeUpItem}>
                  <div
                    className={`rounded-lg border p-4 text-center border-l-4 ${cylColor.border} ${
                      item.emptyStock > 0
                        ? `${cylColor.bg}`
                        : "bg-white dark:bg-zinc-950"
                    }`}
                  >
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {item.cylinderSize}
                    </p>
                    <p className={`text-3xl font-bold mt-2 ${item.emptyStock > 0 ? "text-amber-600" : "text-zinc-400"}`}>
                      {item.emptyStock}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">empty cylinders</p>
                  </div>
                </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 2: Daily Reconciliation */}
      <motion.div variants={fadeUpItem} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Daily Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.reconciliation && data.reconciliation.length > 0 ? (
              <>
                {/* Mobile card view */}
                <div className="block sm:hidden space-y-3">
                  {data.reconciliation.map((item) => (
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
                          <Badge variant={item.mismatch !== 0 ? "destructive" : "success"} className="text-sm font-bold">
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
                        <th className="text-left py-2 px-3 font-medium text-zinc-500">Size</th>
                        <th className="text-right py-2 px-3 font-medium text-zinc-500">Issued</th>
                        <th className="text-right py-2 px-3 font-medium text-zinc-500">DBC</th>
                        <th className="text-right py-2 px-3 font-medium text-zinc-500">Expected</th>
                        <th className="text-right py-2 px-3 font-medium text-zinc-500">Returned</th>
                        <th className="text-right py-2 px-3 font-medium text-zinc-500">Mismatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reconciliation.map((item) => (
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
              </>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No settlements found for this date</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 3: Per-Settlement Breakdown */}
      {data?.settlements && data.settlements.length > 0 && (
        <motion.div variants={fadeUpItem} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per-Settlement Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {data.settlements.map((s) => {
                  const totalEmpties = s.emptyCylindersReturned.reduce((sum, e) => sum + e.quantity, 0);
                  const totalIssued = s.items.reduce((sum, i) => sum + i.quantity, 0);
                  return (
                    <AccordionItem key={s._id} value={s._id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          <span className="font-medium">{s.staffName}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {totalIssued} issued
                          </Badge>
                          <Badge variant={totalEmpties > 0 ? "warning" : "secondary"} className="text-[10px]">
                            {totalEmpties} returned
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          {/* Items sold */}
                          <div>
                            <p className="text-xs font-medium text-zinc-500 mb-1">Cylinders Issued</p>
                            <div className="flex gap-1 flex-wrap">
                              {s.items.map((item, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">
                                  {item.quantity}x {item.cylinderSize}
                                  {item.isNewConnection ? " (DBC)" : ""}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          {/* Empties returned */}
                          <div>
                            <p className="text-xs font-medium text-zinc-500 mb-1">Empties Returned</p>
                            {s.emptyCylindersReturned.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {s.emptyCylindersReturned.map((e, i) => (
                                  <Badge key={i} variant="warning" className="text-[10px]">
                                    {e.quantity}x {e.cylinderSize}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-zinc-400">No empties returned</p>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Section 4: 7-Day Trend */}
      <motion.div variants={fadeUpItem} initial="hidden" animate="show">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">7-Day Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mobile card view */}
            <div className="block sm:hidden space-y-2">
              {data?.weeklyTrend.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-lg border p-3 ${
                    day.totalMismatch !== 0
                      ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                      : "border-zinc-100 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{formatShortDate(day.date)}</p>
                    <Badge variant={day.totalMismatch !== 0 ? "destructive" : "success"} className="text-sm font-bold">
                      {day.totalMismatch > 0 ? "+" : ""}{day.totalMismatch}
                    </Badge>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-zinc-500">
                    <span>Issued: {day.totalIssued}</span>
                    <span>Returned: {day.totalReturned}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-2 px-3 font-medium text-zinc-500">Date</th>
                    <th className="text-right py-2 px-3 font-medium text-zinc-500">Total Issued</th>
                    <th className="text-right py-2 px-3 font-medium text-zinc-500">Total Returned</th>
                    <th className="text-right py-2 px-3 font-medium text-zinc-500">Mismatch</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.weeklyTrend.map((day) => (
                    <tr
                      key={day.date}
                      className={`border-b border-zinc-100 dark:border-zinc-800 ${
                        day.totalMismatch !== 0 ? "bg-red-50/50 dark:bg-red-900/10" : ""
                      }`}
                    >
                      <td className="py-2 px-3 font-medium">{formatShortDate(day.date)}</td>
                      <td className="text-right py-2 px-3">{day.totalIssued}</td>
                      <td className="text-right py-2 px-3">{day.totalReturned}</td>
                      <td className="text-right py-2 px-3">
                        <Badge variant={day.totalMismatch !== 0 ? "destructive" : "success"} className="text-sm font-bold">
                          {day.totalMismatch > 0 ? "+" : ""}{day.totalMismatch}
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
    </div>
  );
}
