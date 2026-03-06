"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Loader2, Calculator, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { StaffSettlementSection, type StaffEntryData } from "@/components/staff-settlement-section";

interface StaffOption {
  _id: string;
  name: string;
}

interface InventoryOption {
  cylinderSize: string;
  pricePerUnit: number;
  fullStock: number;
}

interface CustomerOption {
  _id: string;
  name: string;
  phone: string;
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split("T")[0];
}

function createEmptyEntry(): StaffEntryData {
  return {
    staffId: "",
    items: [{ cylinderSize: "", quantity: 0 }],
    addOns: [],
    deductions: [],
    denominations: [],
    emptyCylindersReturned: [],
    emptyShortage: [],
    addToStaffDebt: false,
    notes: "",
  };
}

export default function NewSettlementPage() {
  const router = useRouter();
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryOption[]>([]);
  const [addonCategories, setAddonCategories] = useState<string[]>([]);
  const [deductionCategories, setDeductionCategories] = useState<string[]>([]);
  const [date, setDate] = useState(getTodayIST());
  const [staffEntries, setStaffEntries] = useState<StaffEntryData[]>([createEmptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftData, setDraftData] = useState<{ date: string; staffEntries: StaffEntryData[] } | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial data
  useEffect(() => {
    Promise.all([
      fetch("/api/staff").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/categories?type=addon").then((r) => r.json()),
      fetch("/api/categories?type=deduction").then((r) => r.json()),
    ]).then(([s, i, c, addonCats, deductCats]) => {
      setStaffList(s);
      setInventoryList(i);
      setCustomerList(c.customers || []);
      const addonList = addonCats.categories || addonCats || [];
      const deductList = deductCats.categories || deductCats || [];
      setAddonCategories(addonList.map((cat: { name: string }) => cat.name));
      setDeductionCategories(deductList.map((cat: { name: string }) => cat.name));
    });
  }, []);

  // Check for draft on load
  useEffect(() => {
    const today = getTodayIST();
    fetch(`/api/settlement-drafts?date=${today}`)
      .then((r) => r.json())
      .then((draft) => {
        if (draft && draft.data) {
          setDraftData(draft.data as { date: string; staffEntries: StaffEntryData[] });
          setShowDraftPrompt(true);
        }
        setDraftLoaded(true);
      })
      .catch(() => setDraftLoaded(true));
  }, []);

  const restoreDraft = () => {
    if (draftData) {
      if (draftData.date) setDate(draftData.date);
      if (draftData.staffEntries) setStaffEntries(draftData.staffEntries);
    }
    setShowDraftPrompt(false);
  };

  const dismissDraft = () => {
    setShowDraftPrompt(false);
    // Delete old draft
    const today = getTodayIST();
    fetch(`/api/settlement-drafts?date=${today}`, { method: "DELETE" }).catch(() => {});
  };

  // Auto-save draft
  const autoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const hasData = staffEntries.some(
        (e) => e.staffId || e.items.some((i) => i.cylinderSize && i.quantity > 0)
      );
      if (!hasData) return;

      fetch("/api/settlement-drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          data: { date, staffEntries },
        }),
      }).catch(() => {});
    }, 5000);
  }, [date, staffEntries]);

  useEffect(() => {
    if (draftLoaded) autoSave();
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [date, staffEntries, draftLoaded, autoSave]);

  const handleCategoryCreated = (name: string, type: "addon" | "deduction") => {
    if (type === "addon" && !addonCategories.includes(name)) {
      setAddonCategories((prev) => [...prev, name]);
    } else if (type === "deduction" && !deductionCategories.includes(name)) {
      setDeductionCategories((prev) => [...prev, name]);
    }
  };

  const addStaffEntry = () => {
    setStaffEntries([...staffEntries, createEmptyEntry()]);
  };

  const removeStaffEntry = (index: number) => {
    if (staffEntries.length <= 1) return;
    setStaffEntries(staffEntries.filter((_, i) => i !== index));
  };

  const updateStaffEntry = (index: number, data: StaffEntryData) => {
    const updated = [...staffEntries];
    updated[index] = data;
    setStaffEntries(updated);
  };

  const usedStaffIds = staffEntries.map((e) => e.staffId).filter(Boolean);

  // Compute consolidated summary
  const consolidated = staffEntries.map((entry) => {
    const grossRevenue = entry.items.reduce((sum, item) => {
      const inv = inventoryList.find((i) => i.cylinderSize === item.cylinderSize);
      const price = item.priceOverride ?? inv?.pricePerUnit ?? 0;
      return sum + price * item.quantity;
    }, 0);
    const totalAddOns = entry.addOns.reduce((sum, a) => sum + a.amount, 0);
    const totalDeductions = entry.deductions.reduce((sum, d) => sum + d.amount, 0);
    const amountExpected = grossRevenue + totalAddOns - totalDeductions;
    const amountReceived = entry.denominations.reduce((sum, d) => sum + d.total, 0);
    const totalCylinders = entry.items.reduce((sum, i) => sum + i.quantity, 0);
    const totalEmpties = entry.emptyCylindersReturned.reduce((sum, e) => sum + e.quantity, 0);
    const staffName = staffList.find((s) => s._id === entry.staffId)?.name || "—";

    return {
      staffName,
      totalCylinders,
      totalEmpties,
      totalAddOns,
      totalDeductions,
      amountExpected,
      amountReceived,
    };
  });

  const totals = {
    cylinders: consolidated.reduce((s, c) => s + c.totalCylinders, 0),
    empties: consolidated.reduce((s, c) => s + c.totalEmpties, 0),
    addOns: consolidated.reduce((s, c) => s + c.totalAddOns, 0),
    deductions: consolidated.reduce((s, c) => s + c.totalDeductions, 0),
    expected: consolidated.reduce((s, c) => s + c.amountExpected, 0),
    received: consolidated.reduce((s, c) => s + c.amountReceived, 0),
  };

  const hasValidEntries = staffEntries.some(
    (e) => e.staffId && e.items.some((i) => i.cylinderSize && i.quantity > 0)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!hasValidEntries) return;

    setSaving(true);
    const res = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        staffEntries: staffEntries
          .filter((e) => e.staffId && e.items.some((i) => i.cylinderSize && i.quantity > 0))
          .map((entry) => ({
            staffId: entry.staffId,
            items: entry.items
              .filter((i) => i.cylinderSize && i.quantity > 0)
              .map((i) => ({
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
      // Delete draft on success
      fetch(`/api/settlement-drafts?date=${date}`, { method: "DELETE" }).catch(() => {});
      toast({
        title: "Settlement created",
        description: "Daily settlement has been recorded",
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
          <p className="text-zinc-500 text-sm mt-1">Record daily settlement for all delivery men</p>
        </div>
      </div>

      {/* Draft Restore Prompt */}
      {showDraftPrompt && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Resume previous work?</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">You have an unfinished settlement from earlier.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={dismissDraft}>
                  Start Fresh
                </Button>
                <Button size="sm" onClick={restoreDraft}>
                  Restore
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Date */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
            <CardHeader>
              <CardTitle className="text-base">Settlement Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-xs">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Staff Settlement Sections */}
          {staffEntries.map((entry, idx) => (
            <StaffSettlementSection
              key={idx}
              index={idx}
              data={entry}
              onChange={(data) => updateStaffEntry(idx, data)}
              onRemove={() => removeStaffEntry(idx)}
              staffList={staffList}
              inventoryList={inventoryList}
              customerList={customerList}
              addonCategories={addonCategories}
              deductionCategories={deductionCategories}
              onCategoryCreated={handleCategoryCreated}
              usedStaffIds={usedStaffIds}
            />
          ))}

          {/* Add Another Delivery Man */}
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed border-2"
            onClick={addStaffEntry}
          >
            <Plus className="h-4 w-4" />
            Add Another Delivery Man
          </Button>

          {/* Consolidated Summary */}
          {consolidated.length > 0 && totals.cylinders > 0 && (
            <Card className="bg-zinc-50 dark:bg-zinc-900 border-2 relative overflow-hidden">
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${sectionThemes.settlements.gradient}`} />
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Consolidated Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Cylinders</TableHead>
                        <TableHead className="text-right">Empties</TableHead>
                        <TableHead className="text-right">Add Ons</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidated.map((c, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{c.staffName}</TableCell>
                          <TableCell className="text-right">{c.totalCylinders}</TableCell>
                          <TableCell className="text-right">{c.totalEmpties}</TableCell>
                          <TableCell className="text-right text-emerald-600">
                            {formatCurrency(c.totalAddOns)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(c.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(c.amountExpected)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(c.amountReceived)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{totals.cylinders}</TableCell>
                        <TableCell className="text-right">{totals.empties}</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {formatCurrency(totals.addOns)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(totals.deductions)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totals.expected)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totals.received)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Total difference */}
                {totals.expected !== totals.received && (
                  <div className={`p-3 rounded-lg ${
                    totals.expected > totals.received
                      ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                      : "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Total {totals.expected > totals.received ? "Short" : "Excess"}
                      </span>
                      <Badge variant={totals.expected > totals.received ? "destructive" : "default"} className="font-mono">
                        {formatCurrency(Math.abs(totals.expected - totals.received))}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-end gap-3">
            {attempted && !hasValidEntries && (
              <p className="text-sm text-red-500 mr-auto">
                Add at least one delivery man with cylinders
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
