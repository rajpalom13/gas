"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  Plus,
  Calculator,
  Calendar,
  User,
  Banknote,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes } from "@/lib/theme";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { StaffSettlementSection, type StaffEntryData } from "@/components/staff-settlement-section";

interface StaffEntryDisplay {
  staff: { _id: string; name: string; phone?: string };
  items: Array<{ cylinderSize: string; quantity: number; pricePerUnit: number; total: number }>;
  grossRevenue: number;
  addOns: Array<{ category: string; amount: number }>;
  deductions: Array<{ category: string; amount: number; debtorId?: { _id: string; name: string } | string; debtorName?: string }>;
  totalAddOns: number;
  totalDeductions: number;
  amountExpected: number;
  denominations: Array<{ note: number; count: number; total: number }>;
  denominationTotal: number;
  cashDifference: number;
  staffDebtAdded: number;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  emptyShortage: Array<{ cylinderSize: string; shortQty: number; debtorId?: { _id: string; name: string } | string; debtorName?: string }>;
  notes: string;
}

interface SettlementData {
  _id: string;
  date: string;
  schemaVersion?: number;
  // V5
  staffEntries?: StaffEntryDisplay[];
  totalGrossRevenue?: number;
  totalAddOns?: number;
  totalDeductions?: number;
  totalExpected?: number;
  totalActualReceived?: number;
  totalCashDifference?: number;
  // V3
  staff?: { _id: string; name: string; phone?: string };
  grossRevenue?: number;
  netRevenue?: number;
  actualCashReceived?: number;
  amountPending?: number;
  items?: Array<{ cylinderSize: string; quantity: number; pricePerUnit: number; total: number; isNewConnection?: boolean }>;
  transactions?: Array<{ category: string; type: string; amount: number; note?: string }>;
  totalCredits?: number;
  totalDebits?: number;
  emptyCylindersReturned?: Array<{ cylinderSize: string; quantity: number }>;
  debtors?: Array<{ customer: { _id: string; name: string } | string; type: string; amount?: number; cylinderSize?: string; quantity?: number }>;
  denominations?: Array<{ note: number; count: number; total: number }>;
  denominationTotal?: number;
  notes?: string;
  createdAt?: string;
}

export default function SettlementDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set([0]));

  // Edit state
  const [editDate, setEditDate] = useState("");
  const [editEntries, setEditEntries] = useState<StaffEntryData[]>([]);
  const [staffList, setStaffList] = useState<Array<{ _id: string; name: string }>>([]);
  const [inventoryList, setInventoryList] = useState<Array<{ cylinderSize: string; pricePerUnit: number; fullStock: number }>>([]);
  const [customerList, setCustomerList] = useState<Array<{ _id: string; name: string; phone?: string }>>([]);
  const [addonCategories, setAddonCategories] = useState<string[]>([]);
  const [deductionCategories, setDeductionCategories] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/settlements/${id}`)
      .then((r) => r.json())
      .then(setSettlement)
      .finally(() => setLoading(false));
  }, [id]);

  const isV5 = settlement?.schemaVersion === 5 && settlement?.staffEntries;

  const startEdit = async () => {
    // Load reference data
    const [s, i, c, addonCats, deductCats] = await Promise.all([
      fetch("/api/staff").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/categories?type=addon").then((r) => r.json()),
      fetch("/api/categories?type=deduction").then((r) => r.json()),
    ]);
    setStaffList(s);
    setInventoryList(i);
    setCustomerList(c.customers || []);
    const addonList = addonCats.categories || addonCats || [];
    const deductList = deductCats.categories || deductCats || [];
    setAddonCategories(addonList.map((cat: { name: string }) => cat.name));
    setDeductionCategories(deductList.map((cat: { name: string }) => cat.name));

    if (!settlement) return;

    setEditDate(formatDateInput(settlement.date));

    if (isV5 && settlement.staffEntries) {
      setEditEntries(
        settlement.staffEntries.map((e) => ({
          staffId: typeof e.staff === "object" ? e.staff._id : String(e.staff),
          items: e.items.map((i) => ({
            cylinderSize: i.cylinderSize,
            quantity: i.quantity,
            priceOverride: i.pricePerUnit,
          })),
          addOns: e.addOns.map((a) => ({ category: a.category, amount: a.amount })),
          deductions: e.deductions.map((d) => ({
            category: d.category,
            amount: d.amount,
            debtorId: typeof d.debtorId === "object" && d.debtorId ? d.debtorId._id : d.debtorId as string | undefined,
            debtorName: d.debtorName,
          })),
          denominations: e.denominations || [],
          emptyCylindersReturned: e.emptyCylindersReturned || [],
          emptyShortage: (e.emptyShortage || []).map((s) => ({
            cylinderSize: s.cylinderSize,
            shortQty: s.shortQty,
            debtorId: typeof s.debtorId === "object" && s.debtorId ? s.debtorId._id : s.debtorId as string | undefined,
            debtorName: s.debtorName,
          })),
          addToStaffDebt: e.staffDebtAdded > 0,
          notes: e.notes || "",
        }))
      );
    } else {
      // V3 -> convert to edit format
      setEditEntries([{
        staffId: settlement.staff?._id || "",
        items: (settlement.items || []).map((i) => ({
          cylinderSize: i.cylinderSize,
          quantity: i.quantity,
          priceOverride: i.pricePerUnit,
        })),
        addOns: (settlement.transactions || [])
          .filter((t) => t.type === "credit")
          .map((t) => ({ category: t.category, amount: t.amount })),
        deductions: (settlement.transactions || [])
          .filter((t) => t.type === "debit")
          .map((t) => ({ category: t.category, amount: t.amount })),
        denominations: settlement.denominations || [],
        emptyCylindersReturned: settlement.emptyCylindersReturned || [],
        emptyShortage: [],
        addToStaffDebt: false,
        notes: settlement.notes || "",
      }]);
    }

    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/settlements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: editDate,
        staffEntries: editEntries.map((entry) => ({
          staffId: entry.staffId,
          items: entry.items.filter((i) => i.cylinderSize && i.quantity > 0).map((i) => ({
            cylinderSize: i.cylinderSize,
            quantity: i.quantity,
            priceOverride: i.priceOverride,
          })),
          addOns: entry.addOns.filter((a) => a.category && a.amount > 0),
          deductions: entry.deductions.filter((d) => d.category && d.amount > 0),
          denominations: entry.denominations.filter((d) => d.count > 0),
          emptyCylindersReturned: entry.emptyCylindersReturned.filter((e) => e.quantity > 0),
          emptyShortage: entry.emptyShortage.filter((s) => s.shortQty > 0),
          addToStaffDebt: entry.addToStaffDebt,
          notes: entry.notes,
        })),
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setSettlement(updated);
      setEditing(false);
      toast({ title: "Settlement updated", variant: "success" });
    } else {
      const data = await res.json().catch(() => null);
      toast({ title: "Error", description: data?.error || "Failed to update", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Settlement deleted", variant: "success" });
      router.push("/settlements");
    } else {
      toast({ title: "Error", description: "Failed to delete settlement", variant: "destructive" });
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const toggleEntry = (idx: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!settlement) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">Settlement not found</p>
        <Link href="/settlements"><Button variant="outline" className="mt-4">Back</Button></Link>
      </div>
    );
  }

  // Edit mode
  if (editing) {
    const usedStaffIds = editEntries.map((e) => e.staffId).filter(Boolean);

    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setEditing(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Edit Settlement</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2 max-w-xs">
              <Label>Date</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {editEntries.map((entry, idx) => (
          <StaffSettlementSection
            key={idx}
            index={idx}
            data={entry}
            onChange={(data) => {
              const updated = [...editEntries];
              updated[idx] = data;
              setEditEntries(updated);
            }}
            onRemove={() => {
              if (editEntries.length > 1) {
                setEditEntries(editEntries.filter((_, i) => i !== idx));
              }
            }}
            staffList={staffList}
            inventoryList={inventoryList}
            customerList={customerList}
            addonCategories={addonCategories}
            deductionCategories={deductionCategories}
            usedStaffIds={usedStaffIds}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed border-2"
          onClick={() =>
            setEditEntries([...editEntries, {
              staffId: "", items: [{ cylinderSize: "", quantity: 0 }],
              addOns: [], deductions: [], denominations: [],
              emptyCylindersReturned: [], emptyShortage: [],
              addToStaffDebt: false, notes: "",
            }])
          }
        >
          <Plus className="h-4 w-4" />
          Add Delivery Man
        </Button>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    );
  }

  // View mode
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Settlement Details"
        subtitle={formatDate(settlement.date)}
        gradient={sectionThemes.settlements.gradient}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={startEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <Link href="/settlements">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Settlements
        </Button>
      </Link>

      {/* V5 Display */}
      {isV5 && settlement.staffEntries ? (
        <>
          {settlement.staffEntries.map((entry, idx) => (
            <Card key={idx} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-b"
                onClick={() => toggleEntry(idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedEntries.has(idx) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    <User className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold">{entry.staff?.name || "Unknown"}</span>
                    <Badge variant="secondary" className="text-xs">
                      {entry.items.reduce((s, i) => s + i.quantity, 0)} cylinders
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">
                      Expected: {formatCurrency(entry.amountExpected)}
                    </Badge>
                    <Badge
                      variant={entry.cashDifference > 0 ? "destructive" : "success"}
                      className="font-mono"
                    >
                      Received: {formatCurrency(entry.denominationTotal)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              {expandedEntries.has(idx) && (
                <CardContent className="p-4 space-y-4">
                  {/* Cylinders */}
                  <div>
                    <p className="text-sm font-medium text-zinc-500 mb-2">Cylinders Delivered</p>
                    <div className="flex gap-2 flex-wrap">
                      {entry.items.map((item, i) => (
                        <Badge key={i} variant="secondary">
                          {item.quantity}x {item.cylinderSize} @ {formatCurrency(item.pricePerUnit)} = {formatCurrency(item.total)}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm mt-2">Gross Revenue: <span className="font-bold text-emerald-600">{formatCurrency(entry.grossRevenue)}</span></p>
                  </div>

                  {/* Add Ons */}
                  {entry.addOns.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-emerald-600 mb-1">Add Ons ({formatCurrency(entry.totalAddOns)})</p>
                      <div className="flex gap-2 flex-wrap">
                        {entry.addOns.map((a, i) => (
                          <Badge key={i} variant="success" className="text-xs">
                            {a.category}: {formatCurrency(a.amount)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deductions */}
                  {entry.deductions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-600 mb-1">Deductions ({formatCurrency(entry.totalDeductions)})</p>
                      <div className="flex gap-2 flex-wrap">
                        {entry.deductions.map((d, i) => {
                          const debtorName = typeof d.debtorId === "object" && d.debtorId
                            ? d.debtorId.name
                            : d.debtorName;
                          return (
                            <Badge key={i} variant="destructive" className="text-xs">
                              {d.category}: {formatCurrency(d.amount)}
                              {debtorName ? ` (${debtorName})` : ""}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Formula */}
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-sm text-center">
                    {formatCurrency(entry.grossRevenue)} + {formatCurrency(entry.totalAddOns)} - {formatCurrency(entry.totalDeductions)} = <span className="font-bold">{formatCurrency(entry.amountExpected)}</span>
                  </div>

                  {/* Cash Details */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                      <p className="text-xs text-zinc-500">Amount Expected</p>
                      <p className="text-lg font-bold">{formatCurrency(entry.amountExpected)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                      <p className="text-xs text-zinc-500">Amount Received</p>
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(entry.denominationTotal)}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${entry.cashDifference > 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-zinc-50 dark:bg-zinc-900"}`}>
                      <p className="text-xs text-zinc-500">Difference</p>
                      <p className={`text-lg font-bold ${entry.cashDifference > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(entry.cashDifference)}
                      </p>
                      {entry.staffDebtAdded > 0 && (
                        <p className="text-xs text-amber-600">Added to staff debt</p>
                      )}
                    </div>
                  </div>

                  {/* Denominations */}
                  {entry.denominations?.length > 0 && entry.denominations.some(d => d.count > 0) && (
                    <div>
                      <p className="text-sm font-medium text-zinc-500 mb-1">Cash Denomination</p>
                      <div className="flex gap-2 flex-wrap">
                        {entry.denominations.filter(d => d.count > 0).map((d, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {formatCurrency(d.note)} x {d.count} = {formatCurrency(d.total)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty Cylinders */}
                  {entry.emptyCylindersReturned?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-zinc-500 mb-1">Empty Cylinders Returned</p>
                      <div className="flex gap-2 flex-wrap">
                        {entry.emptyCylindersReturned.map((e, i) => (
                          <Badge key={i} variant="warning" className="text-xs">
                            {e.quantity}x {e.cylinderSize}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {entry.notes && (
                    <p className="text-sm text-zinc-500 italic">Note: {entry.notes}</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}

          {/* Consolidated Summary */}
          <Card className="bg-zinc-50 dark:bg-zinc-900 border-2 relative overflow-hidden">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${sectionThemes.settlements.gradient}`} />
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Consolidated Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Total Expected</p>
                  <p className="text-lg font-bold">{formatCurrency(settlement.totalExpected || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Total Received</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(settlement.totalActualReceived || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Total Difference</p>
                  <p className={`text-lg font-bold ${(settlement.totalCashDifference || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatCurrency(settlement.totalCashDifference || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* V3 Display */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              {settlement.staff?.name || "Unknown"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Items */}
            <div>
              <p className="text-sm font-medium text-zinc-500 mb-2">Cylinders</p>
              <div className="flex gap-2 flex-wrap">
                {(settlement.items || []).map((item, i) => (
                  <Badge key={i} variant="secondary">
                    {item.quantity}x {item.cylinderSize} = {formatCurrency(item.total)}
                    {item.isNewConnection ? " (DBC)" : ""}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Transactions */}
            {settlement.transactions && settlement.transactions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-1">Transactions</p>
                <div className="flex gap-2 flex-wrap">
                  {settlement.transactions.map((t, i) => (
                    <Badge key={i} variant={t.type === "credit" ? "success" : "destructive"} className="text-xs">
                      {t.category}: {formatCurrency(t.amount)} ({t.type})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Net Revenue</p>
                <p className="text-lg font-bold">{formatCurrency(settlement.netRevenue || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Actual Cash</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(settlement.actualCashReceived || 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Amount Pending</p>
                <p className={`text-lg font-bold ${(settlement.amountPending || 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {formatCurrency(settlement.amountPending || 0)}
                </p>
              </div>
            </div>

            {/* Empty Cylinders */}
            {settlement.emptyCylindersReturned && settlement.emptyCylindersReturned.length > 0 && (
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-1">Empty Cylinders Returned</p>
                <div className="flex gap-2 flex-wrap">
                  {settlement.emptyCylindersReturned.map((e, i) => (
                    <Badge key={i} variant="warning" className="text-xs">
                      {e.quantity}x {e.cylinderSize}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {settlement.notes && <p className="text-sm text-zinc-500 italic">Note: {settlement.notes}</p>}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Settlement</DialogTitle>
            <DialogDescription>
              This will reverse all inventory changes, staff debts, and customer debts associated with this settlement. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Settlement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDateInput(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}
