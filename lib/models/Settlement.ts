import mongoose, { Schema, Document, Model, Types } from "mongoose";

// V3 interfaces
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
  cylinderSize: "5kg" | "10kg" | "14kg" | "19kg";
  quantity: number;
  pricePerUnit: number;
  total: number;
  isNewConnection: boolean;
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
}

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
    cylinderSize: { type: String, enum: ["5kg", "10kg", "14kg", "19kg"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    pricePerUnit: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true },
    isNewConnection: { type: Boolean, default: false },
  },
  { _id: false }
);

const SettlementSchema = new Schema<ISettlement>(
  {
    staff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    date: { type: Date, required: true },
    items: [SettlementItemSchema],
    grossRevenue: { type: Number, default: 0 },
    // V3 fields
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
    denominations: [{
      note: { type: Number, required: true },
      count: { type: Number, required: true },
      total: { type: Number, required: true },
    }],
    denominationTotal: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

SettlementSchema.index({ staff: 1, date: -1 });
SettlementSchema.index({ date: -1 });

export const Settlement: Model<ISettlement> =
  mongoose.models.Settlement || mongoose.model<ISettlement>("Settlement", SettlementSchema);

// Transaction category enums
export const CREDIT_CATEGORIES = ["Paytm", "Cash", "UPI", "PhonePe", "Other"] as const;
export const DEBIT_CATEGORIES = ["Fuel", "Discount", "Return", "Maintenance", "Other"] as const;
