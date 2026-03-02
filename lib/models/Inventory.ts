import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInventory extends Document {
  cylinderSize: string;
  fullStock: number;
  emptyStock: number;
  pricePerUnit: number;
  updatedAt: Date;
}

const InventorySchema = new Schema<IInventory>(
  {
    cylinderSize: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => /^[0-9]+(\.[0-9]+)?\s*(kg|lb|ltr)$/i.test(v),
        message: 'Invalid cylinder size format. Use format like "5kg", "10.5kg", "25ltr"',
      },
    },
    fullStock: { type: Number, default: 0, min: 0 },
    emptyStock: { type: Number, default: 0, min: 0 },
    pricePerUnit: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export const Inventory: Model<IInventory> =
  mongoose.models.Inventory || mongoose.model<IInventory>("Inventory", InventorySchema);
