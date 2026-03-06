"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";
import { formatCurrency } from "@/lib/utils";

interface AddOn {
  category: string;
  amount: number;
}

interface AddonEntryProps {
  addOns: AddOn[];
  onChange: (addOns: AddOn[]) => void;
  categories: string[];
  onCategoryCreated?: (name: string) => void;
}

export function AddonEntry({ addOns, onChange, categories, onCategoryCreated }: AddonEntryProps) {
  const total = addOns.reduce((sum, a) => sum + a.amount, 0);

  const addRow = () => {
    onChange([...addOns, { category: "", amount: 0 }]);
  };

  const removeRow = (index: number) => {
    onChange(addOns.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, updates: Partial<AddOn>) => {
    const updated = [...addOns];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {addOns.map((addon, idx) => (
          <div key={idx} className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[150px] space-y-1">
              <Label className="text-xs">Category</Label>
              <CategoryCombobox
                type="addon"
                value={addon.category}
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
                value={addon.amount || ""}
                onChange={(e) => updateRow(idx, { amount: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(idx)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3 w-3" />
        Add Add-On
      </Button>

      {addOns.length > 0 && (
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-500">Total Add Ons:</span>
          <Badge variant="success" className="font-mono">{formatCurrency(total)}</Badge>
        </div>
      )}
    </div>
  );
}
