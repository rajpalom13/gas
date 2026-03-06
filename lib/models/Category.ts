import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  type: "addon" | "deduction";
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ["addon", "deduction"], required: true },
  },
  { timestamps: true }
);

CategorySchema.index({ name: 1, type: 1 }, { unique: true });

export const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>("Category", CategorySchema);
