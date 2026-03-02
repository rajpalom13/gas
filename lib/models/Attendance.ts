import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAttendance extends Document {
  staff: Types.ObjectId;
  date: Date;
  status: "present" | "absent" | "half-day";
  note: string;
  markedBy: "web" | "telegram";
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    staff: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent", "half-day"], required: true },
    note: { type: String, default: "" },
    markedBy: { type: String, enum: ["web", "telegram"], default: "web" },
  },
  { timestamps: true }
);

AttendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

export const Attendance =
  mongoose.models.Attendance || mongoose.model<IAttendance>("Attendance", AttendanceSchema);
