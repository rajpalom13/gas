import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ISettlementDraft extends Document {
  date: Date;
  data: Record<string, unknown>;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SettlementDraftSchema = new Schema<ISettlementDraft>(
  {
    date: { type: Date, required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const SettlementDraft: Model<ISettlementDraft> =
  mongoose.models.SettlementDraft || mongoose.model<ISettlementDraft>("SettlementDraft", SettlementDraftSchema);
