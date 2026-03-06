"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, FileText, Eye, Receipt } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes } from "@/lib/theme";
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

interface StaffEntryRow {
  staff: { _id: string; name: string };
  grossRevenue: number;
  totalAddOns: number;
  totalDeductions: number;
  amountExpected: number;
  denominationTotal: number;
  cashDifference: number;
  items: Array<{ cylinderSize: string; quantity: number }>;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
}

interface SettlementRow {
  _id: string;
  date: string;
  schemaVersion?: number;
  // V5 fields
  staffEntries?: StaffEntryRow[];
  totalGrossRevenue?: number;
  totalAddOns?: number;
  totalDeductions?: number;
  totalExpected?: number;
  totalActualReceived?: number;
  totalCashDifference?: number;
  // V3 fields (backward compat)
  staff?: { _id: string; name: string };
  grossRevenue?: number;
  netRevenue?: number;
  actualCashReceived?: number;
  amountPending?: number;
  items?: Array<{ cylinderSize: string; quantity: number }>;
  // Legacy
  expectedCash?: number;
  actualCash?: number;
  shortage?: number;
}

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settlements?page=${page}&limit=15`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [page]);

  // Helper functions to handle V3/V5/legacy
  const isV5 = (s: SettlementRow) => s.schemaVersion === 5 && s.staffEntries;

  const getStaffCount = (s: SettlementRow) =>
    isV5(s) ? s.staffEntries!.length : 1;

  const getStaffNames = (s: SettlementRow) =>
    isV5(s)
      ? s.staffEntries!.map((e) => e.staff?.name || "Unknown").join(", ")
      : s.staff?.name || "Unknown";

  const getTotalCylinders = (s: SettlementRow) =>
    isV5(s)
      ? s.staffEntries!.reduce((sum, e) => sum + e.items.reduce((a, i) => a + i.quantity, 0), 0)
      : (s.items || []).reduce((sum, i) => sum + i.quantity, 0);

  const getExpected = (s: SettlementRow) =>
    isV5(s) ? s.totalExpected || 0 : s.netRevenue ?? s.expectedCash ?? 0;

  const getReceived = (s: SettlementRow) =>
    isV5(s) ? s.totalActualReceived || 0 : s.actualCashReceived ?? s.actualCash ?? 0;

  const getPending = (s: SettlementRow) => {
    if (isV5(s)) return s.totalCashDifference || 0;
    return s.amountPending ?? s.shortage ?? 0;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Settlements"
        subtitle={`${data.total} total settlements`}
        gradient={sectionThemes.settlements.gradient}
        actions={
          <Link href="/settlements/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Settlement
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="block sm:hidden space-y-3">
            {data.settlements.map((s) => {
              const pending = getPending(s);
              return (
                <Link key={s._id} href={`/settlements/${s._id}`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3 border-l-4 ${
                      pending > 0
                        ? "border-l-amber-500"
                        : "border-l-emerald-500"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{getStaffNames(s)}</p>
                        <p className="text-xs text-zinc-500">{formatDate(s.date)}</p>
                      </div>
                      <Badge variant={pending > 0 ? "destructive" : "success"}>
                        {formatCurrency(pending)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 text-xs text-zinc-400">
                        <span>{getStaffCount(s)} staff</span>
                        <span>{getTotalCylinders(s)} cylinders</span>
                      </div>
                      <p className="text-sm font-semibold text-emerald-600">
                        {formatCurrency(getExpected(s))}
                      </p>
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
                    <TableHead className="text-right">Cylinders</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.settlements.map((s) => {
                    const pending = getPending(s);
                    return (
                      <motion.tr
                        key={s._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`border-b border-zinc-100 dark:border-zinc-800 ${
                          pending > 0
                            ? "border-l-4 border-l-amber-500"
                            : "border-l-4 border-l-emerald-500"
                        }`}
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
                          <div className="flex flex-col">
                            <span>{getStaffNames(s)}</span>
                            {getStaffCount(s) > 1 && (
                              <span className="text-xs text-zinc-400">
                                {getStaffCount(s)} delivery men
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {getTotalCylinders(s)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(getExpected(s))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(getReceived(s))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={pending > 0 ? "destructive" : "success"}
                          >
                            {formatCurrency(pending)}
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
                        colSpan={7}
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
