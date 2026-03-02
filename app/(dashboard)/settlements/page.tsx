"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, Eye, ChevronDown, ChevronRight, List, CalendarDays } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SettlementRow {
  _id: string;
  staff: { _id: string; name: string };
  date: string;
  items: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
  grossRevenue: number;
  // V3 fields
  transactions?: Array<{ category: string; type: string; amount: number }>;
  totalCredits?: number;
  totalDebits?: number;
  netRevenue?: number;
  actualCashReceived?: number;
  amountPending?: number;
  // Legacy fields
  expenses: number;
  expectedCash: number;
  actualCash: number;
  shortage: number;
}

interface DaySummary {
  date: string;
  settlements: SettlementRow[];
  staffCount: number;
  totalCylinders: number;
  totalNewConnections: number;
  totalNetRevenue: number;
  totalActualCash: number;
  totalAmountPending: number;
}

type ViewMode = "list" | "day-summary";

export default function SettlementsPage() {
  const [data, setData] = useState<{
    settlements: SettlementRow[];
    total: number;
    pages: number;
  }>({
    settlements: [],
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settlements?page=${page}&limit=15`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page]);

  // Helper to get V3 values with legacy fallback
  const getCredits = (s: SettlementRow) => s.totalCredits ?? 0;
  const getDebits = (s: SettlementRow) => s.totalDebits ?? s.expenses ?? 0;
  const getNetRevenue = (s: SettlementRow) => s.netRevenue ?? s.expectedCash ?? 0;
  const getActualCash = (s: SettlementRow) => s.actualCashReceived ?? s.actualCash ?? 0;
  const getAmountPending = (s: SettlementRow) => s.amountPending ?? s.shortage ?? 0;
  const getDBCCount = (s: SettlementRow) =>
    s.items.filter((i) => i.isNewConnection).reduce((sum, i) => sum + i.quantity, 0);

  // Group settlements by date for day summary view
  const daySummaries: DaySummary[] = (() => {
    const grouped = new Map<string, SettlementRow[]>();
    for (const s of data.settlements) {
      const dateKey = formatDate(s.date);
      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
      grouped.get(dateKey)!.push(s);
    }
    return Array.from(grouped.entries()).map(([date, settlements]) => {
      const staffSet = new Set(settlements.map((s) => s.staff._id));
      return {
        date,
        settlements,
        staffCount: staffSet.size,
        totalCylinders: settlements.reduce(
          (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0),
          0
        ),
        totalNewConnections: settlements.reduce((sum, s) => sum + getDBCCount(s), 0),
        totalNetRevenue: settlements.reduce((sum, s) => sum + getNetRevenue(s), 0),
        totalActualCash: settlements.reduce((sum, s) => sum + getActualCash(s), 0),
        totalAmountPending: settlements.reduce((sum, s) => sum + getAmountPending(s), 0),
      };
    });
  })();

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settlements</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {data.total} total settlements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button
              className={`px-3 py-2 text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === "list"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3 w-3" />
              List
            </button>
            <button
              className={`px-3 py-2 text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === "day-summary"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
              onClick={() => setViewMode("day-summary")}
            >
              <CalendarDays className="h-3 w-3" />
              Day Summary
            </button>
          </div>
          <Link href="/settlements/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Settlement
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <>
          {/* Mobile card view */}
          <div className="block sm:hidden space-y-3">
            {data.settlements.map((s) => {
              const dbcCount = getDBCCount(s);
              return (
                <Link key={s._id} href={`/settlements/${s._id}`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{s.staff.name}</p>
                        <p className="text-xs text-zinc-500">{formatDate(s.date)}</p>
                      </div>
                      <Badge
                        variant={getAmountPending(s) > 0 ? "destructive" : "success"}
                      >
                        {formatCurrency(getAmountPending(s))}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1 flex-wrap">
                        {s.items.map((item, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {item.quantity}x {item.cylinderSize}
                            {item.isNewConnection ? " (DBC)" : ""}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(getNetRevenue(s))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      {getCredits(s) > 0 && (
                        <span className="text-emerald-600">
                          +{formatCurrency(getCredits(s))}
                        </span>
                      )}
                      {getDebits(s) > 0 && (
                        <span className="text-red-600">
                          -{formatCurrency(getDebits(s))}
                        </span>
                      )}
                      {dbcCount > 0 && (
                        <Badge variant="default" className="text-[10px] bg-blue-600">
                          {dbcCount} DBC
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                </Link>
              );
            })}
            {data.settlements.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No settlements yet
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Cylinders</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Debits</TableHead>
                    <TableHead>Net Revenue</TableHead>
                    <TableHead>Actual Cash</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.settlements.map((s) => {
                    const dbcCount = getDBCCount(s);
                    return (
                      <motion.tr
                        key={s._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <TableCell className="font-medium">
                          <Link
                            href={`/settlements/${s._id}`}
                            className="hover:underline"
                          >
                            {formatDate(s.date)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/staff/${s.staff._id}/ledger`}
                            className="hover:underline"
                          >
                            {s.staff.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {s.items.map((item, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {item.quantity}x {item.cylinderSize}
                              </Badge>
                            ))}
                            {dbcCount > 0 && (
                              <Badge
                                variant="default"
                                className="text-[10px] bg-blue-600"
                              >
                                {dbcCount} DBC
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-emerald-600">
                            {formatCurrency(getCredits(s))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-red-600">
                            {formatCurrency(getDebits(s))}
                          </span>
                        </TableCell>
                        <TableCell>{formatCurrency(getNetRevenue(s))}</TableCell>
                        <TableCell>
                          {formatCurrency(getActualCash(s))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              getAmountPending(s) > 0
                                ? "destructive"
                                : "success"
                            }
                          >
                            {formatCurrency(getAmountPending(s))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/settlements/${s._id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                  {data.settlements.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-12 text-zinc-500"
                      >
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No settlements yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Day Summary View */
        <div className="space-y-3">
          {daySummaries.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No settlements yet
            </div>
          )}
          {daySummaries.map((day) => {
            const isExpanded = expandedDays.has(day.date);
            return (
              <motion.div
                key={day.date}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
              >
                {/* Day header */}
                <button
                  className="w-full text-left p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  onClick={() => toggleDay(day.date)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400" />
                      )}
                      <div>
                        <p className="font-semibold">{day.date}</p>
                        <p className="text-xs text-zinc-500">
                          {day.staffCount} staff | {day.totalCylinders} cylinders
                          {day.totalNewConnections > 0 &&
                            ` | ${day.totalNewConnections} DBC`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Net Revenue</p>
                        <p className="font-semibold">
                          {formatCurrency(day.totalNetRevenue)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Actual Cash</p>
                        <p className="font-semibold text-blue-600">
                          {formatCurrency(day.totalActualCash)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Pending</p>
                        <p
                          className={`font-semibold ${
                            day.totalAmountPending > 0
                              ? "text-red-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {formatCurrency(day.totalAmountPending)}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded settlements */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50">
                        {day.settlements.map((s) => {
                          const dbcCount = getDBCCount(s);
                          return (
                            <Link
                              key={s._id}
                              href={`/settlements/${s._id}`}
                              className="block"
                            >
                              <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-zinc-950 hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-700 transition-all">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-sm">
                                    {s.staff.name}
                                  </span>
                                  <div className="flex gap-1 flex-wrap">
                                    {s.items.map((item, i) => (
                                      <Badge
                                        key={i}
                                        variant="secondary"
                                        className="text-[10px]"
                                      >
                                        {item.quantity}x {item.cylinderSize}
                                      </Badge>
                                    ))}
                                    {dbcCount > 0 && (
                                      <Badge
                                        variant="default"
                                        className="text-[10px] bg-blue-600"
                                      >
                                        {dbcCount} DBC
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm">
                                  <span>{formatCurrency(getNetRevenue(s))}</span>
                                  <Badge
                                    variant={
                                      getAmountPending(s) > 0
                                        ? "destructive"
                                        : "success"
                                    }
                                    className="text-[10px]"
                                  >
                                    {formatCurrency(getAmountPending(s))}
                                  </Badge>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {data.pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="flex items-center text-sm text-zinc-500">
            Page {page} of {data.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
