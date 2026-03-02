"use client";

import { Plus, Trash2 } from "lucide-react";
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

const CREDIT_CATEGORIES = ["Paytm", "Cash", "UPI", "PhonePe", "Other"];
const DEBIT_CATEGORIES = ["Fuel", "Discount", "Return", "Maintenance", "Other"];

interface Transaction {
  category: string;
  type: "credit" | "debit";
  amount: number;
  note?: string;
}

interface TransactionEntryProps {
  transactions: Transaction[];
  onChange: (transactions: Transaction[]) => void;
}

export function TransactionEntry({ transactions, onChange }: TransactionEntryProps) {
  const totalCredits = transactions
    .filter((t) => t.type === "credit")
    .reduce((acc, t) => acc + t.amount, 0);
  const totalDebits = transactions
    .filter((t) => t.type === "debit")
    .reduce((acc, t) => acc + t.amount, 0);
  const net = totalCredits - totalDebits;

  const addTransaction = () => {
    onChange([...transactions, { category: "", type: "credit", amount: 0, note: "" }]);
  };

  const removeTransaction = (index: number) => {
    onChange(transactions.filter((_, i) => i !== index));
  };

  const updateTransaction = (index: number, updates: Partial<Transaction>) => {
    const updated = [...transactions];
    const merged = { ...updated[index], ...updates };
    // Reset category if type changed and current category doesn't apply
    if (updates.type && updates.type !== updated[index].type) {
      const validCategories = updates.type === "credit" ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
      if (!validCategories.includes(merged.category)) {
        merged.category = "";
      }
    }
    updated[index] = merged;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {transactions.map((txn, idx) => {
          const categories = txn.type === "credit" ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
          return (
            <div key={idx} className="flex items-end gap-2 flex-wrap">
              {/* Type toggle */}
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <div className="flex rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      txn.type === "credit"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                    onClick={() => updateTransaction(idx, { type: "credit" })}
                  >
                    Credit
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      txn.type === "debit"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-white dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    }`}
                    onClick={() => updateTransaction(idx, { type: "debit" })}
                  >
                    Debit
                  </button>
                </div>
              </div>

              {/* Category */}
              <div className="flex-1 min-w-[120px] space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={txn.category}
                  onValueChange={(v) => updateTransaction(idx, { category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="w-28 space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  min={0}
                  value={txn.amount || ""}
                  onChange={(e) => updateTransaction(idx, { amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>

              {/* Note */}
              <div className="flex-1 min-w-[100px] space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  value={txn.note || ""}
                  onChange={(e) => updateTransaction(idx, { note: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              {/* Remove */}
              <Button type="button" variant="ghost" size="icon" onClick={() => removeTransaction(idx)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addTransaction}>
        <Plus className="h-3 w-3" />
        Add Transaction
      </Button>

      {/* Running totals */}
      {transactions.length > 0 && (
        <div className="flex items-center gap-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Credits:</span>
            <Badge variant="success" className="font-mono">{formatCurrency(totalCredits)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Debits:</span>
            <Badge variant="destructive" className="font-mono">{formatCurrency(totalDebits)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Net:</span>
            <Badge
              variant={net >= 0 ? "success" : "destructive"}
              className="font-mono"
            >
              {net >= 0 ? "+" : ""}{formatCurrency(net)}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
