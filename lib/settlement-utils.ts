/**
 * Settlement utility functions for V3 settlement system.
 * Pure functions usable on both client and server.
 */

export interface TransactionInput {
  category: string;
  type: "credit" | "debit";
  amount: number;
  note?: string;
}

export interface SettlementItemInput {
  cylinderSize: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
  isNewConnection?: boolean;
}

export interface EmptyCylinderInput {
  cylinderSize: string;
  quantity: number;
}

export interface ComputedSettlement {
  grossRevenue: number;
  totalCredits: number;
  totalDebits: number;
  netRevenue: number;
  amountPending: number;
  // Legacy fields
  addPayment: number;
  reducePayment: number;
  expenses: number;
  expectedCash: number;
  shortage: number;
}

export interface EmptyReconciliationItem {
  cylinderSize: string;
  issued: number;
  newConnections: number;
  expected: number;
  returned: number;
  mismatch: number;
}

/**
 * Compute all settlement totals from transactions and items.
 */
export function computeSettlement(
  items: SettlementItemInput[],
  transactions: TransactionInput[],
  actualCashReceived: number
): ComputedSettlement {
  const grossRevenue = items.reduce((acc, item) => acc + item.total, 0);

  const totalCredits = transactions
    .filter((t) => t.type === "credit")
    .reduce((acc, t) => acc + t.amount, 0);

  const totalDebits = transactions
    .filter((t) => t.type === "debit")
    .reduce((acc, t) => acc + t.amount, 0);

  const netRevenue = grossRevenue + totalCredits - totalDebits;
  const amountPending = Math.max(0, netRevenue - actualCashReceived);

  // Compute legacy fields for backward compatibility
  const addPayment = totalCredits;
  const reducePayment = transactions
    .filter((t) => t.type === "debit" && t.category === "Discount")
    .reduce((acc, t) => acc + t.amount, 0);
  const expenses = transactions
    .filter((t) => t.type === "debit" && t.category !== "Discount")
    .reduce((acc, t) => acc + t.amount, 0);
  const expectedCash = netRevenue;
  const shortage = amountPending;

  return {
    grossRevenue,
    totalCredits,
    totalDebits,
    netRevenue,
    amountPending,
    addPayment,
    reducePayment,
    expenses,
    expectedCash,
    shortage,
  };
}

/**
 * Compute empty cylinder reconciliation: expected empties vs actual returns.
 */
export function computeEmptyReconciliation(
  items: SettlementItemInput[],
  emptyCylindersReturned: EmptyCylinderInput[]
): EmptyReconciliationItem[] {
  // Aggregate items by cylinder size
  const sizeMap = new Map<string, { issued: number; newConnections: number }>();
  for (const item of items) {
    const existing = sizeMap.get(item.cylinderSize) || { issued: 0, newConnections: 0 };
    existing.issued += item.quantity;
    if (item.isNewConnection) {
      existing.newConnections += item.quantity;
    }
    sizeMap.set(item.cylinderSize, existing);
  }

  const result: EmptyReconciliationItem[] = [];
  for (const [cylinderSize, { issued, newConnections }] of sizeMap) {
    const expected = issued - newConnections;
    const returnEntry = emptyCylindersReturned.find((e) => e.cylinderSize === cylinderSize);
    const returned = returnEntry?.quantity || 0;
    const mismatch = expected - returned;

    result.push({
      cylinderSize,
      issued,
      newConnections,
      expected,
      returned,
      mismatch,
    });
  }

  return result;
}

/**
 * Normalize a legacy settlement (no schemaVersion or version < 3) to V3 field names.
 * Used for reading old data in a consistent format.
 */
export function normalizeSettlement(doc: Record<string, unknown>): Record<string, unknown> {
  if (doc.schemaVersion === 3) return doc;

  return {
    ...doc,
    transactions: doc.transactions || [],
    totalCredits: (doc.totalCredits as number) || (doc.addPayment as number) || 0,
    totalDebits: (doc.totalDebits as number) || ((doc.reducePayment as number) || 0) + ((doc.expenses as number) || 0),
    netRevenue: (doc.netRevenue as number) || (doc.expectedCash as number) || 0,
    actualCashReceived: (doc.actualCashReceived as number) || (doc.actualCash as number) || 0,
    amountPending: (doc.amountPending as number) || (doc.shortage as number) || 0,
    emptyCylindersReturned: doc.emptyCylindersReturned || [],
    debtors: doc.debtors || [],
    schemaVersion: doc.schemaVersion || 1,
  };
}
