"use client";

import { Plus, Trash2, UserPlus } from "lucide-react";
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
import { CategoryCombobox } from "@/components/category-combobox";
import { formatCurrency } from "@/lib/utils";

interface Deduction {
  category: string;
  amount: number;
  debtorId?: string;
  debtorName?: string;
}

interface DeductionEntryProps {
  deductions: Deduction[];
  onChange: (deductions: Deduction[]) => void;
  categories: string[];
  customers: Array<{ _id: string; name: string; phone?: string }>;
  onCategoryCreated?: (name: string) => void;
}

export function DeductionEntry({
  deductions,
  onChange,
  categories,
  customers,
  onCategoryCreated,
}: DeductionEntryProps) {
  const total = deductions.reduce((sum, d) => sum + d.amount, 0);

  const addRow = () => {
    onChange([...deductions, { category: "", amount: 0 }]);
  };

  const removeRow = (index: number) => {
    onChange(deductions.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, updates: Partial<Deduction>) => {
    const updated = [...deductions];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const toggleDebtor = (index: number) => {
    const d = deductions[index];
    if (d.debtorId || d.debtorName) {
      updateRow(index, { debtorId: undefined, debtorName: undefined });
    } else {
      updateRow(index, { debtorId: "", debtorName: "" });
    }
  };

  const hasDebtor = (d: Deduction) => d.debtorId !== undefined || d.debtorName !== undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {deductions.map((deduction, idx) => (
          <div key={idx} className="space-y-2">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[150px] space-y-1">
                <Label className="text-xs">Category</Label>
                <CategoryCombobox
                  type="deduction"
                  value={deduction.category}
                  onChange={(v) => updateRow(idx, { category: v })}
                  categories={categories}
                  onCategoryCreated={onCategoryCreated}
                />
              </div>

              <div className="w-28 space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  min={0}
                  value={deduction.amount || ""}
                  onChange={(e) => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>

              <Button
                type="button"
                variant={hasDebtor(deduction) ? "default" : "outline"}
                size="sm"
                className="mb-0.5"
                onClick={() => toggleDebtor(idx)}
                title="Assign to debtor"
              >
                <UserPlus className="h-3 w-3" />
              </Button>

              <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(idx)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            {hasDebtor(deduction) && (
              <div className="flex items-end gap-2 flex-wrap pl-4 border-l-2 border-orange-300 dark:border-orange-700">
                <div className="flex-1 min-w-[150px] space-y-1">
                  <Label className="text-xs">Customer</Label>
                  <Select
                    value={deduction.debtorId || ""}
                    onValueChange={(v) => {
                      const customer = customers.find((c) => c._id === v);
                      updateRow(idx, {
                        debtorId: v,
                        debtorName: customer?.name || "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
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
                    value={deduction.debtorId ? "" : deduction.debtorName || ""}
                    onChange={(e) =>
                      updateRow(idx, { debtorId: "", debtorName: e.target.value })
                    }
                    placeholder="New customer"
                    disabled={!!deduction.debtorId}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3 w-3" />
        Add Deduction
      </Button>

      {deductions.length > 0 && (
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">Total Deductions:</span>
          <Badge variant="destructive" className="font-mono">{formatCurrency(total)}</Badge>
        </div>
      )}
    </div>
  );
}
