"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Debtor {
  customerId: string;
  type: "cash" | "cylinder";
  amount?: number;
  cylinderSize?: string;
  quantity?: number;
}

interface DebtorEntryProps {
  debtors: Debtor[];
  onChange: (debtors: Debtor[]) => void;
  customers: Array<{ _id: string; name: string; phone?: string }>;
  cylinderSizes: string[];
}

export function DebtorEntry({ debtors, onChange, customers, cylinderSizes }: DebtorEntryProps) {
  const addDebtor = () => {
    onChange([...debtors, { customerId: "", type: "cash", amount: 0 }]);
  };

  const removeDebtor = (index: number) => {
    onChange(debtors.filter((_, i) => i !== index));
  };

  const updateDebtor = (index: number, updates: Partial<Debtor>) => {
    const updated = [...debtors];
    const merged = { ...updated[index], ...updates };
    // Reset conditional fields when type changes
    if (updates.type === "cash") {
      merged.cylinderSize = undefined;
      merged.quantity = undefined;
    } else if (updates.type === "cylinder") {
      merged.amount = undefined;
    }
    updated[index] = merged;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {debtors.map((debtor, idx) => (
          <div key={idx} className="flex items-end gap-2 flex-wrap p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
            {/* Customer */}
            <div className="flex-1 min-w-[150px] space-y-1">
              <Label className="text-xs">Customer</Label>
              <Select
                value={debtor.customerId}
                onValueChange={(v) => updateDebtor(idx, { customerId: v })}
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

            {/* Type toggle */}
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <div className="flex rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    debtor.type === "cash"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                  onClick={() => updateDebtor(idx, { type: "cash" })}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    debtor.type === "cylinder"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                  onClick={() => updateDebtor(idx, { type: "cylinder" })}
                >
                  Cylinder
                </button>
              </div>
            </div>

            {/* Conditional fields */}
            {debtor.type === "cash" && (
              <div className="w-28 space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  min={0}
                  value={debtor.amount || ""}
                  onChange={(e) => updateDebtor(idx, { amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            )}

            {debtor.type === "cylinder" && (
              <>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Size</Label>
                  <Select
                    value={debtor.cylinderSize || ""}
                    onValueChange={(v) => updateDebtor(idx, { cylinderSize: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Size" />
                    </SelectTrigger>
                    <SelectContent>
                      {cylinderSizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
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
                    value={debtor.quantity || ""}
                    onChange={(e) => updateDebtor(idx, { quantity: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </>
            )}

            {/* Remove */}
            <Button type="button" variant="ghost" size="icon" onClick={() => removeDebtor(idx)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addDebtor}>
        <Plus className="h-3 w-3" />
        Add Debtor
      </Button>
    </div>
  );
}
