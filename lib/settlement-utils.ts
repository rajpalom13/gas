/**
 * Settlement utility functions for V3 and V5 settlement systems.
 * Pure functions usable on both client and server.
 */

// ─── V3 types (kept for backward compat) ───

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

// ─── V5 types ───

export interface AddOnInput {
  category: string;
  amount: number;
}

export interface DeductionInput {
  category: string;
  amount: number;
  debtorId?: string;
  debtorName?: string;
}

export interface DenominationInput {
  note: number;
  count: number;
  total: number;
}

export interface ComputedStaffEntry {
  grossRevenue: number;
  totalAddOns: number;
  totalDeductions: number;
  amountExpected: number;
  denominationTotal: number;
  cashDifference: number;
}

export interface ConsolidatedSummary {
  totalGrossRevenue: number;
  totalAddOns: number;
  totalDeductions: number;
  totalExpected: number;
  totalActualReceived: number;
  totalCashDifference: number;
}

// ─── V3 functions (deprecated - kept for backward compat) ───

/**
 * @deprecated Use computeStaffEntry for V5
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
 * @deprecated Use emptyShortage tracking in V5 staffEntries
 */
export function computeEmptyReconciliation(
  items: SettlementItemInput[],
  emptyCylindersReturned: EmptyCylinderInput[]
): EmptyReconciliationItem[] {
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

// ─── V5 functions ───

export function computeStaffEntry(
  items: SettlementItemInput[],
  addOns: AddOnInput[],
  deductions: DeductionInput[],
  denominations: DenominationInput[]
): ComputedStaffEntry {
  const grossRevenue = items.reduce((acc, item) => acc + item.total, 0);
  const totalAddOns = addOns.reduce((acc, a) => acc + a.amount, 0);
  const totalDeductions = deductions.reduce((acc, d) => acc + d.amount, 0);
  const amountExpected = grossRevenue + totalAddOns - totalDeductions;
  const denominationTotal = denominations.reduce((acc, d) => acc + d.total, 0);
  const cashDifference = amountExpected - denominationTotal;
  return { grossRevenue, totalAddOns, totalDeductions, amountExpected, denominationTotal, cashDifference };
}

export function computeConsolidated(entries: ComputedStaffEntry[]): ConsolidatedSummary {
  return {
    totalGrossRevenue: entries.reduce((s, e) => s + e.grossRevenue, 0),
    totalAddOns: entries.reduce((s, e) => s + e.totalAddOns, 0),
    totalDeductions: entries.reduce((s, e) => s + e.totalDeductions, 0),
    totalExpected: entries.reduce((s, e) => s + e.amountExpected, 0),
    totalActualReceived: entries.reduce((s, e) => s + e.denominationTotal, 0),
    totalCashDifference: entries.reduce((s, e) => s + e.cashDifference, 0),
  };
}

// ─── Normalization ───

/**
 * Normalize a settlement document to a consistent format.
 * Handles V1/V2 -> V3 legacy normalization, and passes V5 through as-is.
 */
export function normalizeSettlement(doc: Record<string, unknown>): Record<string, unknown> {
  // V5 documents pass through as-is
  if (doc.schemaVersion === 5) return doc;

  // V3 documents pass through as-is
  if (doc.schemaVersion === 3) return doc;

  // Legacy (V1/V2) -> V3 normalization
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

/**
 * Convert a V3 settlement document to V5 staffEntries format.
 * Useful for displaying old data in V5 UI.
 */
export function v3ToV5StaffEntry(doc: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeSettlement(doc);
  const transactions = (normalized.transactions as Array<{ category: string; type: string; amount: number }>) || [];

  const addOns = transactions
    .filter((t) => t.type === "credit")
    .map((t) => ({ category: t.category, amount: t.amount }));

  const debtors = (normalized.debtors as Array<{ customer: unknown; type: string; amount?: number }>) || [];
  const deductions = [
    ...transactions
      .filter((t) => t.type === "debit")
      .map((t) => ({ category: t.category, amount: t.amount })),
    ...debtors
      .filter((d) => d.type === "cash" && d.amount)
      .map((d) => ({ category: "Debtor", amount: d.amount!, debtorId: d.customer })),
  ];

  const totalAddOns = addOns.reduce((s, a) => s + a.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const grossRevenue = (normalized.grossRevenue as number) || 0;
  const denominationTotal = (normalized.denominationTotal as number) || (normalized.actualCashReceived as number) || 0;

  return {
    staff: normalized.staff,
    items: normalized.items || [],
    grossRevenue,
    addOns,
    deductions,
    totalAddOns,
    totalDeductions,
    amountExpected: grossRevenue + totalAddOns - totalDeductions,
    denominations: normalized.denominations || [],
    denominationTotal,
    cashDifference: (grossRevenue + totalAddOns - totalDeductions) - denominationTotal,
    staffDebtAdded: 0,
    emptyCylindersReturned: normalized.emptyCylindersReturned || [],
    emptyShortage: [],
    notes: normalized.notes || "",
  };
}
