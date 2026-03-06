"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DenominationEntry } from "@/components/denomination-entry";
import { AddonEntry } from "@/components/addon-entry";
import { DeductionEntry } from "@/components/deduction-entry";
import { formatCurrency } from "@/lib/utils";

interface StaffEntryData {
  staffId: string;
  items: Array<{ cylinderSize: string; quantity: number; priceOverride?: number }>;
  addOns: Array<{ category: string; amount: number }>;
  deductions: Array<{ category: string; amount: number; debtorId?: string; debtorName?: string }>;
  denominations: Array<{ note: number; count: number; total: number }>;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  emptyShortage: Array<{ cylinderSize: string; shortQty: number; debtorId?: string; debtorName?: string }>;
  addToStaffDebt: boolean;
  notes: string;
}

interface StaffSettlementSectionProps {
  index: number;
  data: StaffEntryData;
  onChange: (data: StaffEntryData) => void;
  onRemove: () => void;
  staffList: Array<{ _id: string; name: string }>;
  inventoryList: Array<{ cylinderSize: string; pricePerUnit: number; fullStock: number }>;
  customerList: Array<{ _id: string; name: string; phone?: string }>;
  addonCategories: string[];
  deductionCategories: string[];
  onCategoryCreated?: (name: string, type: "addon" | "deduction") => void;
  usedStaffIds: string[];
}

const NOTES = [2000, 500, 200, 100, 50, 20, 10];

export function StaffSettlementSection({
  index,
  data,
  onChange,
  onRemove,
  staffList,
  inventoryList,
  customerList,
  addonCategories,
  deductionCategories,
  onCategoryCreated,
  usedStaffIds,
}: StaffSettlementSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const staff = staffList.find((s) => s._id === data.staffId);
  const staffName = staff?.name || `Delivery Man #${index + 1}`;
  const availableStaff = staffList.filter(
    (s) => s._id === data.staffId || !usedStaffIds.includes(s._id)
  );

  // Computed values
  const grossRevenue = data.items.reduce((sum, item) => {
    const inv = inventoryList.find((i) => i.cylinderSize === item.cylinderSize);
    const price = item.priceOverride ?? inv?.pricePerUnit ?? 0;
    return sum + price * item.quantity;
  }, 0);

  const totalAddOns = data.addOns.reduce((sum, a) => sum + a.amount, 0);
  const totalDeductions = data.deductions.reduce((sum, d) => sum + d.amount, 0);
  const amountExpected = grossRevenue + totalAddOns - totalDeductions;
  const amountReceived = data.denominations.reduce((sum, d) => sum + d.total, 0);
  const difference = amountExpected - amountReceived;

  const totalCylinders = data.items.reduce((sum, item) => sum + item.quantity, 0);

  // Cylinder item helpers
  const addCylinderRow = () => {
    onChange({
      ...data,
      items: [...data.items, { cylinderSize: "", quantity: 0 }],
    });
  };

  const removeCylinderRow = (idx: number) => {
    onChange({
      ...data,
      items: data.items.filter((_, i) => i !== idx),
    });
  };

  const updateCylinderRow = (idx: number, updates: Partial<StaffEntryData["items"][0]>) => {
    const updated = [...data.items];
    updated[idx] = { ...updated[idx], ...updates };
    onChange({ ...data, items: updated });
  };

  // Empty cylinder helpers
  const getExpectedEmpties = () => {
    const sizeMap = new Map<string, number>();
    for (const item of data.items) {
      if (!item.cylinderSize) continue;
      sizeMap.set(item.cylinderSize, (sizeMap.get(item.cylinderSize) || 0) + item.quantity);
    }
    return Array.from(sizeMap, ([cylinderSize, quantity]) => ({ cylinderSize, quantity }));
  };

  const handleEmptyChange = (cylinderSize: string, quantity: number) => {
    const updated = [...data.emptyCylindersReturned];
    const existingIdx = updated.findIndex((e) => e.cylinderSize === cylinderSize);
    if (existingIdx >= 0) {
      updated[existingIdx] = { cylinderSize, quantity };
    } else {
      updated.push({ cylinderSize, quantity });
    }
    onChange({ ...data, emptyCylindersReturned: updated });
  };

  const expectedEmpties = getExpectedEmpties();

  // Empty shortage helpers
  const getEmptyShortages = () => {
    return expectedEmpties
      .map((exp) => {
        const returned = data.emptyCylindersReturned.find((e) => e.cylinderSize === exp.cylinderSize);
        const returnedQty = returned?.quantity || 0;
        const short = exp.quantity - returnedQty;
        return { cylinderSize: exp.cylinderSize, shortQty: short > 0 ? short : 0 };
      })
      .filter((s) => s.shortQty > 0);
  };

  const emptyShortages = getEmptyShortages();

  const updateShortageDebtor = (
    cylinderSize: string,
    updates: { debtorId?: string; debtorName?: string }
  ) => {
    const updated = [...data.emptyShortage];
    const idx = updated.findIndex((s) => s.cylinderSize === cylinderSize);
    const shortage = emptyShortages.find((s) => s.cylinderSize === cylinderSize);
    if (!shortage) return;
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], ...updates };
    } else {
      updated.push({ cylinderSize, shortQty: shortage.shortQty, ...updates });
    }
    onChange({ ...data, emptyShortage: updated });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-blue-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-blue-600" />
            )}
            <span className="font-semibold text-blue-900 dark:text-blue-100">
              {staffName}
            </span>
            {totalCylinders > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalCylinders} cylinders
              </Badge>
            )}
            {amountExpected > 0 && (
              <Badge variant="outline" className="font-mono text-xs">
                {formatCurrency(amountExpected)}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 space-y-6">
          {/* 1. Staff Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Delivery Staff</Label>
            <Select
              value={data.staffId}
              onValueChange={(v) => onChange({ ...data, staffId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select delivery man" />
              </SelectTrigger>
              <SelectContent>
                {availableStaff.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Cylinders Delivered */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
              Cylinders Delivered
            </Label>
            <div className="space-y-2">
              {data.items.map((item, idx) => {
                const inv = inventoryList.find((i) => i.cylinderSize === item.cylinderSize);
                const price = item.priceOverride ?? inv?.pricePerUnit ?? 0;
                const lineTotal = price * item.quantity;

                return (
                  <div
                    key={idx}
                    className="flex items-end gap-2 flex-wrap p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/20"
                  >
                    <div className="w-28 space-y-1">
                      <Label className="text-xs">Size</Label>
                      <Select
                        value={item.cylinderSize}
                        onValueChange={(v) => {
                          const inv2 = inventoryList.find((i) => i.cylinderSize === v);
                          updateCylinderRow(idx, {
                            cylinderSize: v,
                            priceOverride: undefined,
                          });
                          // Auto-clear override so default price is used
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Size" />
                        </SelectTrigger>
                        <SelectContent>
                          {inventoryList.map((inv) => (
                            <SelectItem key={inv.cylinderSize} value={inv.cylinderSize}>
                              {inv.cylinderSize}
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
                          updateCylinderRow(idx, { quantity: parseInt(e.target.value) || 0 })
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="w-28 space-y-1">
                      <Label className="text-xs">
                        Price {inv ? `(${formatCurrency(inv.pricePerUnit)})` : ""}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={item.priceOverride ?? inv?.pricePerUnit ?? ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          updateCylinderRow(idx, {
                            priceOverride: isNaN(val) ? undefined : val,
                          });
                        }}
                        placeholder={inv ? String(inv.pricePerUnit) : "0"}
                      />
                    </div>

                    <div className="w-24 text-right space-y-1">
                      <Label className="text-xs text-zinc-400">Total</Label>
                      <p className="text-sm font-medium py-2">{formatCurrency(lineTotal)}</p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCylinderRow(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCylinderRow}>
              <Plus className="h-3 w-3" />
              Add Cylinder
            </Button>
          </div>

          {/* 3. Gross Revenue */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
            <span className="text-sm font-medium">Gross Revenue</span>
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono">
              {formatCurrency(grossRevenue)}
            </span>
          </div>

          {/* 4. Add Ons */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Add Ons
            </Label>
            <AddonEntry
              addOns={data.addOns}
              onChange={(addOns) => onChange({ ...data, addOns })}
              categories={addonCategories}
              onCategoryCreated={(name) => onCategoryCreated?.(name, "addon")}
            />
          </div>

          {/* 5. Deductions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-red-700 dark:text-red-400">
              Deductions
            </Label>
            <DeductionEntry
              deductions={data.deductions}
              onChange={(deductions) => onChange({ ...data, deductions })}
              categories={deductionCategories}
              customers={customerList}
              onCategoryCreated={(name) => onCategoryCreated?.(name, "deduction")}
            />
          </div>

          {/* 6. Formula Display */}
          <div className="p-4 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
              <span className="font-mono">{formatCurrency(grossRevenue)}</span>
              <span className="text-emerald-600">+</span>
              <span className="font-mono text-emerald-600">{formatCurrency(totalAddOns)}</span>
              <span className="text-red-600">-</span>
              <span className="font-mono text-red-600">{formatCurrency(totalDeductions)}</span>
              <span>=</span>
              <span className="font-bold font-mono text-lg">{formatCurrency(amountExpected)}</span>
            </div>
            <p className="text-center text-xs text-zinc-500 mt-1">
              Gross Revenue + Add Ons - Deductions = Amount Expected
            </p>
          </div>

          {/* 7. Cash Denomination */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Cash Denomination
            </Label>
            <DenominationEntry
              denominations={
                data.denominations.length > 0
                  ? data.denominations
                  : NOTES.map((n) => ({ note: n, count: 0, total: 0 }))
              }
              onChange={(denominations) => onChange({ ...data, denominations })}
            />
          </div>

          {/* 8. Amount Received */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <span className="text-sm font-medium">Amount Received</span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(amountReceived)}
            </span>
          </div>

          {/* 9. Difference */}
          <div
            className={`flex items-center justify-between p-3 rounded-lg border ${
              difference === 0
                ? "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                : difference > 0
                ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
            }`}
          >
            <div>
              <span className="text-sm font-medium">
                {difference > 0 ? "Short" : difference < 0 ? "Excess" : "Balanced"}
              </span>
              <span className="text-xs text-zinc-500 ml-2">
                (Expected - Received)
              </span>
            </div>
            <span
              className={`text-lg font-bold font-mono ${
                difference === 0
                  ? "text-zinc-600"
                  : difference > 0
                  ? "text-red-600"
                  : "text-blue-600"
              }`}
            >
              {formatCurrency(Math.abs(difference))}
            </span>
          </div>

          {difference > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.addToStaffDebt}
                onChange={(e) => onChange({ ...data, addToStaffDebt: e.target.checked })}
                className="rounded border-zinc-300"
              />
              <span className="text-sm">
                Add {formatCurrency(difference)} to staff debt
              </span>
            </label>
          )}

          {/* 10. Empty Cylinders Returned */}
          {expectedEmpties.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Empty Cylinders Returned
              </Label>
              <div className="grid gap-2">
                {expectedEmpties.map((exp) => {
                  const returnEntry = data.emptyCylindersReturned.find(
                    (e) => e.cylinderSize === exp.cylinderSize
                  );
                  const currentQty = returnEntry?.quantity ?? 0;
                  const short = exp.quantity - currentQty;
                  const hasMismatch = currentQty !== exp.quantity;

                  return (
                    <div
                      key={exp.cylinderSize}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        hasMismatch
                          ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
                          : "bg-zinc-50 dark:bg-zinc-900"
                      }`}
                    >
                      <Badge variant="secondary" className="w-14 justify-center">
                        {exp.cylinderSize}
                      </Badge>
                      <span className="text-sm text-zinc-500">
                        Issued: {exp.quantity}
                      </span>
                      <div className="w-20">
                        <Input
                          type="number"
                          min={0}
                          value={currentQty || ""}
                          onChange={(e) =>
                            handleEmptyChange(exp.cylinderSize, parseInt(e.target.value) || 0)
                          }
                          className="text-center"
                          placeholder="0"
                        />
                      </div>
                      {hasMismatch && short > 0 && (
                        <Badge variant="warning" className="text-[10px]">
                          {short} short
                        </Badge>
                      )}
                      {!hasMismatch && (
                        <Badge variant="success" className="text-[10px]">
                          OK
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 11. Empty shortage debtor assignment */}
          {emptyShortages.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Assign Empty Cylinder Shortage
              </Label>
              {emptyShortages.map((shortage) => {
                const existing = data.emptyShortage.find(
                  (s) => s.cylinderSize === shortage.cylinderSize
                );
                return (
                  <div
                    key={shortage.cylinderSize}
                    className="flex items-end gap-2 flex-wrap p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20"
                  >
                    <Badge variant="secondary" className="mb-2">
                      {shortage.cylinderSize} x {shortage.shortQty} short
                    </Badge>
                    <div className="flex-1 min-w-[150px] space-y-1">
                      <Label className="text-xs">Customer</Label>
                      <Select
                        value={existing?.debtorId || ""}
                        onValueChange={(v) => {
                          const customer = customerList.find((c) => c._id === v);
                          updateShortageDebtor(shortage.cylinderSize, {
                            debtorId: v,
                            debtorName: customer?.name || "",
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerList.map((c) => (
                            <SelectItem key={c._id} value={c._id}>
                              {c.name}{c.phone ? ` - ${c.phone}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-36 space-y-1">
                      <Label className="text-xs">Or new name</Label>
                      <Input
                        value={existing?.debtorId ? "" : existing?.debtorName || ""}
                        onChange={(e) =>
                          updateShortageDebtor(shortage.cylinderSize, {
                            debtorId: "",
                            debtorName: e.target.value,
                          })
                        }
                        placeholder="New customer"
                        disabled={!!existing?.debtorId}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 12. Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <StickyNote className="h-3 w-3" />
              Notes
            </Label>
            <Input
              value={data.notes}
              onChange={(e) => onChange({ ...data, notes: e.target.value })}
              placeholder="Optional notes for this settlement..."
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export type { StaffEntryData, StaffSettlementSectionProps };
