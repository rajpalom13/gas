import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICylinderDebt {
  cylinderSize: string;
  quantity: number;
}

export interface ICustomer extends Document {
  name: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
  cashDebt: number;
  cylinderDebts: ICylinderDebt[];
  createdAt: Date;
  updatedAt: Date;
}

const CylinderDebtSchema = new Schema<ICylinderDebt>(
  {
    cylinderSize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    cashDebt: { type: Number, default: 0 },
    cylinderDebts: { type: [CylinderDebtSchema], default: [] },
  },
  { timestamps: true }
);

CustomerSchema.index({ name: 1 });

export const Customer: Model<ICustomer> =
  mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);
