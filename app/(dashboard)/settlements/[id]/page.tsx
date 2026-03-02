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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DenominationEntry } from "@/components/denomination-entry";
import { TransactionEntry } from "@/components/transaction-entry";
import { EmptyCylinderEntry } from "@/components/empty-cylinder-entry";
import { DebtorEntry } from "@/components/debtor-entry";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import {
  normalizeSettlement,
  computeSettlement,
  computeEmptyReconciliation,
  type SettlementItemInput,
} from "@/lib/settlement-utils";

interface SettlementItem {
  cylinderSize: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
  isNewConnection?: boolean;
}

interface Transaction {
  category: string;
  type: "credit" | "debit";
  amount: number;
  note?: string;
}

interface DebtorData {
  customer: { _id: string; name: string; phone?: string } | string;
  type: "cash" | "cylinder";
  amount?: number;
  cylinderSize?: string;
  quantity?: number;
}

interface Denomination {
  note: number;
  count: number;
  total: number;
}

interface SettlementData {
  _id: string;
  staff: { _id: string; name: string; phone?: string };
  customer?: { _id: string; name: string; phone?: string };
  date: string;
  items: SettlementItem[];
  grossRevenue: number;
  // V3 fields
  transactions: Transaction[];
  totalCredits: number;
  totalDebits: number;
  netRevenue: number;
  actualCashReceived: number;
  amountPending: number;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  debtors: DebtorData[];
  schemaVersion: number;
  // Legacy
  addPayment: number;
  reducePayment: number;
  expenses: number;
  expectedCash: number;
  actualCash: number;
  shortage: number;
  // Common
  notes: string;
  denominations: Denomination[];
  denominationTotal: number;
  createdAt: string;
  updatedAt: string;
}

interface InventoryOption {
  cylinderSize: string;
  pricePerUnit: number;
  fullStock: number;
}

interface CustomerOption {
  _id: string;
  name: string;
  phone?: string;
}

interface EditItem {
  cylinderSize: string;
  quantity: number;
  isNewConnection: boolean;
  priceOverride?: number;
}

interface EditDebtor {
  customerId: string;
  type: "cash" | "cylinder";
  amount?: number;
  cylinderSize?: string;
  quantity?: number;
}

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventoryList, setInventoryList] = useState<InventoryOption[]>([]);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [editDate, setEditDate] = useState("");
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editTransactions, setEditTransactions] = useState<Transaction[]>([]);
  const [editActualCash, setEditActualCash] = useState(0);
  const [editEmptyCylindersReturned, setEditEmptyCylindersReturned] = useState<
    Array<{ cylinderSize: string; quantity: number }>
  >([]);
  const [editDebtors, setEditDebtors] = useState<EditDebtor[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editDenominations, setEditDenominations] = useState<Denomination[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/settlements/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        // Normalize legacy settlements to V3 format
        const normalized = normalizeSettlement(data) as unknown as SettlementData;
        setSettlement(normalized);
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Settlement not found",
          variant: "destructive",
        });
        router.push("/settlements");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const startEditing = () => {
    if (!settlement) return;
    // Fetch inventory and customers for edit form
    Promise.all([
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
    ]).then(([inv, c]) => {
      setInventoryList(inv);
      setCustomerList(c.customers || []);
    });

    setEditDate(new Date(settlement.date).toISOString().split("T")[0]);
    setEditItems(
      settlement.items.map((item) => ({
        cylinderSize: item.cylinderSize,
        quantity: item.quantity,
        isNewConnection: item.isNewConnection || false,
        priceOverride: undefined,
      }))
    );
    setEditTransactions(settlement.transactions || []);
    setEditActualCash(settlement.actualCashReceived || settlement.actualCash || 0);
    setEditEmptyCylindersReturned(settlement.emptyCylindersReturned || []);
    setEditDebtors(
      (settlement.debtors || []).map((d) => ({
        customerId: typeof d.customer === "string" ? d.customer : d.customer._id,
        type: d.type,
        amount: d.amount,
        cylinderSize: d.cylinderSize,
        quantity: d.quantity,
      }))
    );
    setEditNotes(settlement.notes);
    setEditDenominations(
      settlement.denominations.length > 0 ? settlement.denominations : []
    );
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const getPrice = (item: EditItem) => {
    if (item.priceOverride && item.priceOverride > 0) return item.priceOverride;
    return (
      inventoryList.find((i) => i.cylinderSize === item.cylinderSize)?.pricePerUnit || 0
    );
  };

  const editComputedItems = editItems
    .filter((i) => i.cylinderSize && i.quantity > 0)
    .map((item) => {
      const price = getPrice(item);
      return {
        cylinderSize: item.cylinderSize,
        quantity: item.quantity,
        pricePerUnit: price,
        total: item.quantity * price,
        isNewConnection: item.isNewConnection,
      };
    });

  const editSettlement = computeSettlement(
    editComputedItems,
    editTransactions,
    editActualCash
  );

  const addEditItem = () => {
    setEditItems([
      ...editItems,
      { cylinderSize: "", quantity: 0, isNewConnection: false },
    ]);
  };

  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const updateEditItem = (
    index: number,
    field: keyof EditItem,
    value: string | number | boolean
  ) => {
    const newItems = [...editItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditItems(newItems);
  };

  const selectedSizes = editItems.map((i) => i.cylinderSize).filter(Boolean);

  const getStockWarning = (item: EditItem) => {
    if (!item.cylinderSize || item.quantity <= 0) return null;
    const inv = inventoryList.find((i) => i.cylinderSize === item.cylinderSize);
    if (!inv) return null;
    const oldItem = settlement?.items.find(
      (oi) => oi.cylinderSize === item.cylinderSize
    );
    const availableStock = inv.fullStock + (oldItem?.quantity || 0);
    if (item.quantity > availableStock) {
      return `Only ${availableStock} available after rollback`;
    }
    return null;
  };

  const hasValidItems = editItems.some((i) => i.cylinderSize && i.quantity > 0);

  const handleSave = async () => {
    if (!hasValidItems) {
      toast({
        title: "Validation Error",
        description: "Add at least one cylinder with quantity greater than 0",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/settlements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editDate,
          items: editComputedItems.map((item) => ({
            cylinderSize: item.cylinderSize,
            quantity: item.quantity,
            isNewConnection: item.isNewConnection,
            priceOverride: editItems.find(
              (i) => i.cylinderSize === item.cylinderSize
            )?.priceOverride,
          })),
          transactions: editTransactions.filter((t) => t.category && t.amount > 0),
          actualCash: editActualCash,
          emptyCylindersReturned: editEmptyCylindersReturned.filter(
            (e) => e.quantity > 0
          ),
          debtors: editDebtors
            .filter((d) => d.customerId)
            .map((d) => ({
              customerId: d.customerId,
              type: d.type,
              amount: d.amount,
              cylinderSize: d.cylinderSize,
              quantity: d.quantity,
            })),
          notes: editNotes,
          denominations: editDenominations.filter((d) => d.count > 0),
          denominationTotal: editDenominations.reduce((sum, d) => sum + d.total, 0),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        const normalized = normalizeSettlement(updated) as unknown as SettlementData;
        setSettlement(normalized);
        setEditing(false);
        toast({
          title: "Settlement updated",
          description: "Settlement has been updated with inventory rollback",
          variant: "success",
        });
      } else {
        const data = await res.json().catch(() => null);
        toast({
          title: "Error",
          description: data?.error || "Failed to update settlement",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Network error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({
          title: "Settlement deleted",
          description: "Settlement has been deleted and inventory rolled back",
          variant: "success",
        });
        router.push("/settlements");
      } else {
        const data = await res.json().catch(() => null);
        toast({
          title: "Error",
          description: data?.error || "Failed to delete settlement",
          variant: "destructive",
        });
        setDeleting(false);
      }
    } catch {
      toast({
        title: "Error",
        description: "Network error",
        variant: "destructive",
      });
      setDeleting(false);
    }
    setShowDeleteDialog(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!settlement) return null;

  // Normalized V3 data
  const s = settlement;

  // --- EDIT MODE ---
  if (editing) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={cancelEditing}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Settlement</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Staff: {settlement.staff.name} -- Editing will rollback and re-apply
              inventory
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Date */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Input
                  value={settlement.staff.name}
                  disabled
                  className="bg-zinc-50 dark:bg-zinc-900"
                />
                <p className="text-xs text-zinc-400">Staff cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Cylinder Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Cylinders Delivered</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEditItem}
                >
                  <Plus className="h-3 w-3" />
                  Add Cylinder
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {editItems.map((item, idx) => {
                const stockWarning = getStockWarning(item);
                const availableSizes = inventoryList.filter(
                  (inv) =>
                    inv.cylinderSize === item.cylinderSize ||
                    !selectedSizes.includes(inv.cylinderSize)
                );
                const price = getPrice(item);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="flex-1 min-w-[140px] space-y-1">
                        <Label className="text-xs">Size</Label>
                        <Select
                          value={item.cylinderSize}
                          onValueChange={(v) =>
                            updateEditItem(idx, "cylinderSize", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSizes.map((inv) => (
                              <SelectItem
                                key={inv.cylinderSize}
                                value={inv.cylinderSize}
                              >
                                {inv.cylinderSize} —{" "}
                                {formatCurrency(inv.pricePerUnit)} (Stock:{" "}
                                {inv.fullStock})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20 space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity || ""}
                          onChange={(e) =>
                            updateEditItem(
                              idx,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Price Override</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.priceOverride || ""}
                          onChange={(e) =>
                            updateEditItem(
                              idx,
                              "priceOverride",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="Default"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">DBC</Label>
                        <Button
                          type="button"
                          variant={item.isNewConnection ? "default" : "outline"}
                          size="sm"
                          className={`w-16 ${
                            item.isNewConnection
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : ""
                          }`}
                          onClick={() =>
                            updateEditItem(
                              idx,
                              "isNewConnection",
                              !item.isNewConnection
                            )
                          }
                        >
                          {item.isNewConnection ? "Yes" : "No"}
                        </Button>
                      </div>
                      <div className="w-24 text-right">
                        <p className="text-sm font-medium">
                          {formatCurrency(item.quantity * price)}
                        </p>
                      </div>
                      {editItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEditItem(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                    {stockWarning && (
                      <p className="text-xs text-amber-600 pl-1">{stockWarning}</p>
                    )}
                    {item.isNewConnection && (
                      <Badge
                        variant="default"
                        className="text-[10px] bg-blue-600"
                      >
                        New Connection (DBC) - No empty return expected
                      </Badge>
                    )}
                  </div>
                );
              })}
              <div className="text-right pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Gross Revenue</p>
                <p className="text-xl font-bold">
                  {formatCurrency(editSettlement.grossRevenue)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TransactionEntry
                transactions={editTransactions}
                onChange={setEditTransactions}
              />
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="space-y-2">
                  <Label>Actual Cash Received *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editActualCash || ""}
                    onChange={(e) =>
                      setEditActualCash(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Empty Cylinders Returned */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empty Cylinders Returned</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyCylinderEntry
                items={editItems.filter((i) => i.cylinderSize && i.quantity > 0)}
                emptyCylindersReturned={editEmptyCylindersReturned}
                onChange={setEditEmptyCylindersReturned}
              />
            </CardContent>
          </Card>

          {/* Debtor Assignment */}
          {(editSettlement.amountPending > 0 || editDebtors.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Debtor Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                {editSettlement.amountPending > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 mb-4">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Amount pending:{" "}
                      {formatCurrency(editSettlement.amountPending)}. Assign
                      debtors below.
                    </p>
                  </div>
                )}
                <DebtorEntry
                  debtors={editDebtors}
                  onChange={setEditDebtors}
                  customers={customerList}
                />
              </CardContent>
            </Card>
          )}

          {/* Denomination Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Cash Denomination (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DenominationEntry
                denominations={editDenominations}
                onChange={setEditDenominations}
                actualCash={editActualCash}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Any additional notes..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-zinc-50 dark:bg-zinc-900 border-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Settlement Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Gross Revenue</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(editSettlement.grossRevenue)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">+ Credits</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(editSettlement.totalCredits)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">- Debits</p>
                  <p className="text-lg font-bold text-orange-600">
                    {formatCurrency(editSettlement.totalDebits)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Net Revenue</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(editSettlement.netRevenue)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Actual Cash</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(editActualCash)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Amount Pending</p>
                  <p
                    className={`text-lg font-bold ${
                      editSettlement.amountPending > 0
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(editSettlement.amountPending)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={cancelEditing}>
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={saving || !hasValidItems}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- VIEW MODE ---
  // Compute empty cylinder reconciliation for view mode
  const viewItemInputs: SettlementItemInput[] = s.items.map((item) => ({
    cylinderSize: item.cylinderSize,
    quantity: item.quantity,
    pricePerUnit: item.pricePerUnit,
    total: item.total,
    isNewConnection: item.isNewConnection,
  }));
  const emptyReconciliation = computeEmptyReconciliation(
    viewItemInputs,
    s.emptyCylindersReturned || []
  );
  const totalDBC = s.items.filter((i) => i.isNewConnection).reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/settlements">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Settlement Details</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {formatDate(s.date)} -- {s.staff.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Staff</p>
                  <p className="font-medium">{s.staff.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <Calendar className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Date</p>
                  <p className="font-medium">{formatDate(s.date)}</p>
                </div>
              </div>
              {s.customer && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <User className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Customer</p>
                    <p className="font-medium">{s.customer.name}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cylinders */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Cylinders Delivered</CardTitle>
              {totalDBC > 0 && (
                <Badge variant="default" className="bg-blue-600">
                  {totalDBC} DBC
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {s.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{item.cylinderSize}</Badge>
                    <span className="text-sm text-zinc-500">
                      {item.quantity} x {formatCurrency(item.pricePerUnit)}
                    </span>
                    {item.isNewConnection && (
                      <Badge
                        variant="default"
                        className="text-[10px] bg-blue-600"
                      >
                        DBC
                      </Badge>
                    )}
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(item.total)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-sm text-zinc-500">Gross Revenue</span>
                <span className="text-xl font-bold text-emerald-600">
                  {formatCurrency(s.grossRevenue)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions */}
        {s.transactions && s.transactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {s.transactions.map((txn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          txn.type === "credit" ? "success" : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {txn.type}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {txn.category}
                      </Badge>
                      {txn.note && (
                        <span className="text-xs text-zinc-400">
                          {txn.note}
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-semibold ${
                        txn.type === "credit"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {txn.type === "credit" ? "+" : "-"}
                      {formatCurrency(txn.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800 flex-wrap gap-2">
                  <div className="flex gap-3">
                    <span className="text-xs text-zinc-500">
                      Credits:{" "}
                      <span className="font-medium text-emerald-600">
                        {formatCurrency(s.totalCredits)}
                      </span>
                    </span>
                    <span className="text-xs text-zinc-500">
                      Debits:{" "}
                      <span className="font-medium text-red-600">
                        {formatCurrency(s.totalDebits)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty Cylinder Reconciliation */}
        {emptyReconciliation.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Empty Cylinder Reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {emptyReconciliation.map((row) => (
                  <div
                    key={row.cylinderSize}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      row.mismatch !== 0
                        ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
                        : "bg-zinc-50 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{row.cylinderSize}</Badge>
                      <span className="text-sm text-zinc-500">
                        Issued: {row.issued}
                        {row.newConnections > 0 && (
                          <span className="text-blue-600">
                            {" "}
                            (DBC: {row.newConnections})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-500">
                        Expected: {row.expected}
                      </span>
                      <span className="text-sm font-medium">
                        Returned: {row.returned}
                      </span>
                      {row.mismatch !== 0 && (
                        <Badge variant="warning" className="text-[10px]">
                          {row.mismatch > 0
                            ? `${row.mismatch} short`
                            : `${Math.abs(row.mismatch)} extra`}
                        </Badge>
                      )}
                      {row.mismatch === 0 && row.expected > 0 && (
                        <Badge variant="success" className="text-[10px]">
                          OK
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Debtors */}
        {s.debtors && s.debtors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Debtors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {s.debtors.map((debtor, idx) => {
                  const customerName =
                    typeof debtor.customer === "string"
                      ? debtor.customer
                      : debtor.customer?.name || "Unknown";
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {customerName}
                        </span>
                        <Badge
                          variant={
                            debtor.type === "cash" ? "warning" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {debtor.type}
                        </Badge>
                      </div>
                      <span className="text-sm font-semibold">
                        {debtor.type === "cash"
                          ? formatCurrency(debtor.amount || 0)
                          : `${debtor.quantity}x ${debtor.cylinderSize}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Financial Summary */}
        <Card className="bg-zinc-50 dark:bg-zinc-900 border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">Gross Revenue</p>
                <p className="text-lg font-bold text-emerald-600">
                  {formatCurrency(s.grossRevenue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">+ Credits</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(s.totalCredits)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">- Debits</p>
                <p className="text-lg font-bold text-orange-600">
                  {formatCurrency(s.totalDebits)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">Net Revenue</p>
                <p className="text-lg font-bold">
                  {formatCurrency(s.netRevenue)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">Actual Cash</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(s.actualCashReceived)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                <p className="text-xs text-zinc-500">Amount Pending</p>
                <p
                  className={`text-lg font-bold ${
                    s.amountPending > 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(s.amountPending)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Denominations */}
        {s.denominations && s.denominations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Cash Denomination
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {s.denominations
                  .filter((d) => d.count > 0)
                  .map((d, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="font-mono">
                          {formatCurrency(d.note)}
                        </Badge>
                        <span className="text-sm text-zinc-500">
                          x {d.count}
                        </span>
                      </div>
                      <span className="font-medium">
                        {formatCurrency(d.total)}
                      </span>
                    </div>
                  ))}
                <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-sm font-medium">
                    Denomination Total
                  </span>
                  <span className="text-lg font-bold">
                    {formatCurrency(s.denominationTotal)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {s.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {s.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Timestamps */}
        <div className="text-xs text-zinc-400 text-right space-y-1">
          <p>
            Created: {new Date(s.createdAt).toLocaleString("en-IN")}
          </p>
          {s.updatedAt !== s.createdAt && (
            <p>
              Updated: {new Date(s.updatedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Settlement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this settlement? This will reverse
              the inventory changes (restore full stock and subtract empty stock)
              and reverse any debt added to{" "}
              <strong>{s.staff.name}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm">
            <p className="font-medium text-red-700 dark:text-red-400">
              Settlement on {formatDate(s.date)}
            </p>
            <p className="text-red-600 dark:text-red-400 mt-1">
              Revenue: {formatCurrency(s.grossRevenue)} | Pending:{" "}
              {formatCurrency(s.amountPending)}
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Settlement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
