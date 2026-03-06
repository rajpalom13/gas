import mongoose, { Schema, Document, Model, Types } from "mongoose";

// ─── V3 interfaces (kept for backward compat) ───

export interface ITransaction {
  category: string;
  type: "credit" | "debit";
  amount: number;
  note?: string;
}

export interface IEmptyCylinderReturn {
  cylinderSize: string;
  quantity: number;
}

export interface IDebtor {
  customer: Types.ObjectId;
  type: "cash" | "cylinder";
  amount?: number;
  cylinderSize?: string;
  quantity?: number;
}

export interface ISettlementItem {
  cylinderSize: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
  isNewConnection?: boolean;
}

export interface IDenomination {
  note: number;
  count: number;
  total: number;
}

export interface ISettlement extends Document {
  staff: Types.ObjectId;
  customer?: Types.ObjectId;
  date: Date;
  items: ISettlementItem[];
  grossRevenue: number;
  // V3 fields
  transactions: ITransaction[];
  totalCredits: number;
  totalDebits: number;
  netRevenue: number;
  actualCashReceived: number;
  amountPending: number;
  emptyCylindersReturned: IEmptyCylinderReturn[];
  debtors: IDebtor[];
  schemaVersion: number;
  // Legacy fields (kept for backward compat)
  addPayment: number;
  reducePayment: number;
  expenses: number;
  expectedCash: number;
  actualCash: number;
  shortage: number;
  // Common fields
  notes: string;
  denominations: IDenomination[];
  denominationTotal: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // V5 fields
  staffEntries?: IStaffEntry[];
  totalGrossRevenue?: number;
  totalAddOns?: number;
  totalDeductions?: number;
  totalExpected?: number;
  totalActualReceived?: number;
  totalCashDifference?: number;
}

// ─── V5 interfaces ───

export interface IAddOn {
  category: string;
  amount: number;
}

export interface IDeduction {
  category: string;
  amount: number;
  debtorId?: Types.ObjectId;
  debtorName?: string;
}

export interface IEmptyShortage {
  cylinderSize: string;
  shortQty: number;
  debtorId?: Types.ObjectId;
  debtorName?: string;
}

export interface IStaffEntry {
  staff: Types.ObjectId;
  items: ISettlementItem[];
  grossRevenue: number;
  addOns: IAddOn[];
  deductions: IDeduction[];
  totalAddOns: number;
  totalDeductions: number;
  amountExpected: number;
  denominations: IDenomination[];
  denominationTotal: number;
  cashDifference: number;
  staffDebtAdded: number;
  emptyCylindersReturned: IEmptyCylinderReturn[];
  emptyShortage: IEmptyShortage[];
  notes: string;
}

export interface ISettlementV5 extends Document {
  date: Date;
  staffEntries: IStaffEntry[];
  totalGrossRevenue: number;
  totalAddOns: number;
  totalDeductions: number;
  totalExpected: number;
  totalActualReceived: number;
  totalCashDifference: number;
  schemaVersion: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── V3 Sub-schemas ───

const TransactionSchema = new Schema<ITransaction>(
  {
    category: { type: String, required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const EmptyCylinderReturnSchema = new Schema<IEmptyCylinderReturn>(
  {
    cylinderSize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const DebtorSchema = new Schema<IDebtor>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: { type: String, enum: ["cash", "cylinder"], required: true },
    amount: { type: Number, min: 0 },
    cylinderSize: { type: String },
    quantity: { type: Number, min: 0 },
  },
  { _id: false }
);

const SettlementItemSchema = new Schema<ISettlementItem>(
  {
    cylinderSize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    pricePerUnit: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true },
    isNewConnection: { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── V5 Sub-schemas ───

const AddOnSchema = new Schema<IAddOn>(
  {
    category: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const DeductionSchema = new Schema<IDeduction>(
  {
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    debtorId: { type: Schema.Types.ObjectId, ref: "Customer" },
    debtorName: { type: String },
  },
  { _id: false }
);

const EmptyShortageSchema = new Schema<IEmptyShortage>(
  {
    cylinderSize: { type: String, required: true },
    shortQty: { type: Number, required: true, min: 0 },
    debtorId: { type: Schema.Types.ObjectId, ref: "Customer" },
    debtorName: { type: String },
  },
  { _id: false }
);

const DenominationSchema = new Schema<IDenomination>(
  {
    note: { type: Number, required: true },
    count: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const StaffEntrySchema = new Schema<IStaffEntry>(
  {
    staff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    items: [SettlementItemSchema],
    grossRevenue: { type: Number, default: 0 },
    addOns: { type: [AddOnSchema], default: [] },
    deductions: { type: [DeductionSchema], default: [] },
    totalAddOns: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    amountExpected: { type: Number, default: 0 },
    denominations: [DenominationSchema],
    denominationTotal: { type: Number, default: 0 },
    cashDifference: { type: Number, default: 0 },
    staffDebtAdded: { type: Number, default: 0 },
    emptyCylindersReturned: { type: [EmptyCylinderReturnSchema], default: [] },
    emptyShortage: { type: [EmptyShortageSchema], default: [] },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

// ─── Main Schema (supports both V3 and V5) ───

const SettlementSchema = new Schema<ISettlement>(
  {
    // V3 flat fields
    staff: { type: Schema.Types.ObjectId, ref: "Staff" },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    date: { type: Date, required: true },
    items: [SettlementItemSchema],
    grossRevenue: { type: Number, default: 0 },
    transactions: { type: [TransactionSchema], default: [] },
    totalCredits: { type: Number, default: 0 },
    totalDebits: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    actualCashReceived: { type: Number, default: 0 },
    amountPending: { type: Number, default: 0 },
    emptyCylindersReturned: { type: [EmptyCylinderReturnSchema], default: [] },
    debtors: { type: [DebtorSchema], default: [] },
    schemaVersion: { type: Number, default: 3 },
    // Legacy fields
    addPayment: { type: Number, default: 0 },
    reducePayment: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    actualCash: { type: Number, default: 0 },
    shortage: { type: Number, default: 0 },
    // Common
    notes: { type: String, default: "" },
    denominations: [DenominationSchema],
    denominationTotal: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    // V5 fields
    staffEntries: { type: [StaffEntrySchema], default: undefined },
    totalGrossRevenue: { type: Number },
    totalAddOns: { type: Number },
    totalDeductions: { type: Number },
    totalExpected: { type: Number },
    totalActualReceived: { type: Number },
    totalCashDifference: { type: Number },
  },
  { timestamps: true }
);

SettlementSchema.index({ staff: 1, date: -1 });
SettlementSchema.index({ date: -1 });

export const Settlement: Model<ISettlement> =
  mongoose.models.Settlement || mongoose.model<ISettlement>("Settlement", SettlementSchema);
