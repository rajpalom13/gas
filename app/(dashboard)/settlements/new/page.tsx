"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Loader2, Calculator } from "lucide-react";
import Link from "next/link";
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
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { DenominationEntry } from "@/components/denomination-entry";
import { TransactionEntry } from "@/components/transaction-entry";
import { EmptyCylinderEntry } from "@/components/empty-cylinder-entry";
import { DebtorEntry } from "@/components/debtor-entry";
import { computeSettlement } from "@/lib/settlement-utils";

interface CustomerOption {
  _id: string;
  name: string;
  phone: string;
}

interface StaffOption {
  _id: string;
  name: string;
}

interface InventoryOption {
  cylinderSize: string;
  pricePerUnit: number;
  fullStock: number;
}

interface SettlementItem {
  cylinderSize: string;
  quantity: number;
  isNewConnection: boolean;
  priceOverride?: number;
}

interface Transaction {
  category: string;
  type: "credit" | "debit";
  amount: number;
  note?: string;
}

interface Debtor {
  customerId: string;
  type: "cash" | "cylinder";
  amount?: number;
  cylinderSize?: string;
  quantity?: number;
}

export default function NewSettlementPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryOption[]>([]);
  const [staffId, setStaffId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<SettlementItem[]>([
    { cylinderSize: "", quantity: 0, isNewConnection: false },
  ]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [actualCashReceived, setActualCashReceived] = useState(0);
  const [emptyCylindersReturned, setEmptyCylindersReturned] = useState<
    Array<{ cylinderSize: string; quantity: number }>
  >([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [notes, setNotes] = useState("");
  const [denominations, setDenominations] = useState<
    { note: number; count: number; total: number }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/staff").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
    ]).then(([s, i, c]) => {
      setStaffList(s);
      setInventoryList(i);
      setCustomerList(c.customers || []);
    });
  }, []);

  const getPrice = (item: SettlementItem) => {
    if (item.priceOverride && item.priceOverride > 0) return item.priceOverride;
    return inventoryList.find((i) => i.cylinderSize === item.cylinderSize)?.pricePerUnit || 0;
  };

  // Build items with computed totals for the settlement calculator
  const computedItems = items
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

  const settlement = computeSettlement(computedItems, transactions, actualCashReceived);

  const addItem = () => {
    setItems([...items, { cylinderSize: "", quantity: 0, isNewConnection: false }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof SettlementItem,
    value: string | number | boolean
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const hasValidItems = items.some((i) => i.cylinderSize && i.quantity > 0);
  const canSubmit = !!staffId && hasValidItems;

  const getStockWarning = (item: SettlementItem) => {
    if (!item.cylinderSize || item.quantity <= 0) return null;
    const inv = inventoryList.find((i) => i.cylinderSize === item.cylinderSize);
    if (!inv) return null;
    if (item.quantity > inv.fullStock) {
      return `Only ${inv.fullStock} available in stock`;
    }
    return null;
  };

  const selectedSizes = items.map((i) => i.cylinderSize).filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!canSubmit) return;

    setSaving(true);
    const res = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId,
        date,
        items: computedItems.map((item) => ({
          cylinderSize: item.cylinderSize,
          quantity: item.quantity,
          isNewConnection: item.isNewConnection,
          priceOverride: items.find(
            (i) => i.cylinderSize === item.cylinderSize
          )?.priceOverride,
        })),
        transactions: transactions.filter((t) => t.category && t.amount > 0),
        actualCash: actualCashReceived,
        emptyCylindersReturned: emptyCylindersReturned.filter((e) => e.quantity > 0),
        debtors: debtors
          .filter((d) => d.customerId)
          .map((d) => ({
            customerId: d.customerId,
            type: d.type,
            amount: d.amount,
            cylinderSize: d.cylinderSize,
            quantity: d.quantity,
          })),
        notes,
        denominations: denominations.filter((d) => d.count > 0),
        denominationTotal: denominations.reduce((sum, d) => sum + d.total, 0),
        customerId: customerId && customerId !== "none" ? customerId : undefined,
      }),
    });

    if (res.ok) {
      toast({
        title: "Settlement created",
        description: "New settlement has been recorded",
        variant: "success",
      });
      router.push("/settlements");
    } else {
      const data = await res.json().catch(() => null);
      toast({
        title: "Error",
        description: data?.error || "Failed to create settlement",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/settlements">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Settlement</h1>
          <p className="text-zinc-500 text-sm mt-1">Record a daily settlement entry</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Staff & Date */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Staff Member *</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger className={attempted && !staffId ? "border-red-400" : ""}>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attempted && !staffId && (
                  <p className="text-xs text-red-500">Please select a staff member</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Customer (Optional)</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No customer</SelectItem>
                    {customerList.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Cylinder Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Cylinders Delivered</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3" />
                  Add Cylinder
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, idx) => {
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
                          onValueChange={(v) => updateItem(idx, "cylinderSize", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSizes.map((inv) => (
                              <SelectItem key={inv.cylinderSize} value={inv.cylinderSize}>
                                {inv.cylinderSize} — {formatCurrency(inv.pricePerUnit)} (Stock:{" "}
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
                            updateItem(idx, "quantity", parseInt(e.target.value) || 0)
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
                            updateItem(
                              idx,
                              "priceOverride",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          placeholder="Default"
                        />
                      </div>
                      {/* DBC toggle */}
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
                            updateItem(idx, "isNewConnection", !item.isNewConnection)
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
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                    {stockWarning && (
                      <p className="text-xs text-amber-600 pl-1">{stockWarning}</p>
                    )}
                    {item.isNewConnection && (
                      <Badge variant="default" className="text-[10px] bg-blue-600">
                        New Connection (DBC) - No empty return expected
                      </Badge>
                    )}
                  </div>
                );
              })}
              <div className="text-right pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Gross Revenue</p>
                <p className="text-xl font-bold">
                  {formatCurrency(settlement.grossRevenue)}
                </p>
              </div>
              {attempted && !hasValidItems && (
                <p className="text-xs text-red-500">
                  Add at least one cylinder with quantity greater than 0
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TransactionEntry transactions={transactions} onChange={setTransactions} />
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="space-y-2">
                  <Label>Actual Cash Received *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={actualCashReceived || ""}
                    onChange={(e) =>
                      setActualCashReceived(parseFloat(e.target.value) || 0)
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
                items={items.filter((i) => i.cylinderSize && i.quantity > 0)}
                emptyCylindersReturned={emptyCylindersReturned}
                onChange={setEmptyCylindersReturned}
              />
            </CardContent>
          </Card>

          {/* Debtor Assignment */}
          {(settlement.amountPending > 0 ||
            emptyCylindersReturned.some((e) => {
              const item = computedItems.find((i) => i.cylinderSize === e.cylinderSize);
              if (!item) return false;
              const expected =
                item.quantity - (item.isNewConnection ? item.quantity : 0);
              return e.quantity !== expected;
            })) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Debtor Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                {settlement.amountPending > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 mb-4">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Amount pending: {formatCurrency(settlement.amountPending)}. Assign
                      debtors below.
                    </p>
                  </div>
                )}
                <DebtorEntry
                  debtors={debtors}
                  onChange={setDebtors}
                  customers={customerList}
                />
              </CardContent>
            </Card>
          )}

          {/* Denomination Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cash Denomination (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <DenominationEntry
                denominations={denominations}
                onChange={setDenominations}
                actualCash={actualCashReceived}
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                    {formatCurrency(settlement.grossRevenue)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">+ Credits</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(settlement.totalCredits)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">- Debits</p>
                  <p className="text-lg font-bold text-orange-600">
                    {formatCurrency(settlement.totalDebits)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Net Revenue</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(settlement.netRevenue)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Actual Cash</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(actualCashReceived)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-950">
                  <p className="text-xs text-zinc-500">Amount Pending</p>
                  <p
                    className={`text-lg font-bold ${
                      settlement.amountPending > 0
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(settlement.amountPending)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {attempted && !canSubmit && (
              <p className="text-sm text-red-500 mr-auto">
                {!staffId
                  ? "Select a staff member"
                  : "Add cylinders with quantity > 0"}
              </p>
            )}
            <Link href="/settlements">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Settlement
            </Button>
          </div>
        </motion.div>
      </form>
    </div>
  );
}
