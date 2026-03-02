"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { computeEmptyReconciliation, type SettlementItemInput, type EmptyCylinderInput } from "@/lib/settlement-utils";

interface EmptyCylinderEntryProps {
  items: Array<{ cylinderSize: string; quantity: number; isNewConnection?: boolean }>;
  emptyCylindersReturned: Array<{ cylinderSize: string; quantity: number }>;
  onChange: (empties: Array<{ cylinderSize: string; quantity: number }>) => void;
}

export function EmptyCylinderEntry({ items, emptyCylindersReturned, onChange }: EmptyCylinderEntryProps) {
  // Convert items to SettlementItemInput format for the utility
  const itemInputs: SettlementItemInput[] = items.map((item) => ({
    cylinderSize: item.cylinderSize,
    quantity: item.quantity,
    pricePerUnit: 0,
    total: 0,
    isNewConnection: item.isNewConnection,
  }));

  const reconciliation = computeEmptyReconciliation(itemInputs, emptyCylindersReturned);

  const handleQuantityChange = (cylinderSize: string, quantity: number) => {
    const updated = [...emptyCylindersReturned];
    const existingIdx = updated.findIndex((e) => e.cylinderSize === cylinderSize);
    if (existingIdx >= 0) {
      updated[existingIdx] = { cylinderSize, quantity };
    } else {
      updated.push({ cylinderSize, quantity });
    }
    onChange(updated);
  };

  if (reconciliation.length === 0) {
    return (
      <p className="text-sm text-zinc-400">Add cylinder items above to track empty returns.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {reconciliation.map((row) => {
          const returnEntry = emptyCylindersReturned.find((e) => e.cylinderSize === row.cylinderSize);
          const currentQty = returnEntry?.quantity ?? 0;
          const hasMismatch = row.expected > 0 && currentQty !== row.expected;

          return (
            <div
              key={row.cylinderSize}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                hasMismatch
                  ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800"
                  : "bg-zinc-50 dark:bg-zinc-900"
              }`}
            >
              <Badge variant="secondary" className="w-14 justify-center">
                {row.cylinderSize}
              </Badge>
              <div className="flex-1 text-sm">
                <span className="text-zinc-500">
                  Issued: {row.issued}
                  {row.newConnections > 0 && (
                    <span className="text-blue-600"> (DBC: {row.newConnections})</span>
                  )}
                </span>
                <span className="text-zinc-400 mx-2">|</span>
                <span className="text-zinc-500">Expected: {row.expected}</span>
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-xs sr-only">Returned</Label>
                <Input
                  type="number"
                  min={0}
                  value={currentQty || ""}
                  onChange={(e) =>
                    handleQuantityChange(row.cylinderSize, parseInt(e.target.value) || 0)
                  }
                  className="text-center"
                  placeholder="0"
                />
              </div>
              {hasMismatch && (
                <Badge variant="warning" className="text-[10px]">
                  {row.mismatch > 0 ? `${row.mismatch} short` : `${Math.abs(row.mismatch)} extra`}
                </Badge>
              )}
              {!hasMismatch && row.expected > 0 && currentQty === row.expected && (
                <Badge variant="success" className="text-[10px]">OK</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
