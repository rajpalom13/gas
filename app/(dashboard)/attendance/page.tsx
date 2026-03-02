"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar, CalendarCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { toast } from "@/lib/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes } from "@/lib/theme";

interface StaffMember {
  _id: string;
  name: string;
}

interface AttendanceRecord {
  _id: string;
  staff: { _id: string; name: string };
  date: string;
  status: "present" | "absent" | "half-day";
  note: string;
  markedBy: string;
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  return istNow.toISOString().split("T")[0];
}

export default function AttendancePage() {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayIST());
  const [savingStaff, setSavingStaff] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [markingAll, setMarkingAll] = useState(false);

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [staffRes, attendanceRes] = await Promise.all([
        fetch("/api/staff"),
        fetch(`/api/attendance?date=${date}`),
      ]);
      const staffData = await staffRes.json();
      const attendanceData = await attendanceRes.json();
      setStaffList(staffData);
      setAttendance(attendanceData);

      // Populate notes from existing records
      const noteMap: Record<string, string> = {};
      for (const rec of attendanceData) {
        noteMap[rec.staff._id] = rec.note || "";
      }
      setNotes(noteMap);
    } catch {
      toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const isToday = selectedDate === getTodayIST();

  const getStaffStatus = (staffId: string): "present" | "absent" | "half-day" | null => {
    const record = attendance.find((a) => a.staff._id === staffId);
    return record ? record.status : null;
  };

  const handleStatusChange = async (staffId: string, status: "present" | "absent" | "half-day") => {
    setSavingStaff(staffId);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          date: selectedDate,
          status,
          note: notes[staffId] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAttendance((prev) => {
        const existing = prev.findIndex((a) => a.staff._id === staffId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data;
          return updated;
        }
        return [...prev, data];
      });
    } catch {
      toast({ title: "Error", description: "Failed to save attendance", variant: "destructive" });
    } finally {
      setSavingStaff(null);
    }
  };

  const handleNoteBlur = async (staffId: string) => {
    const record = attendance.find((a) => a.staff._id === staffId);
    if (!record) return;
    if (record.note === (notes[staffId] || "")) return;

    try {
      await fetch(`/api/attendance/${record._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[staffId] || "" }),
      });
    } catch {
      toast({ title: "Error", description: "Failed to update note", variant: "destructive" });
    }
  };

  const handleMarkAllPresent = async () => {
    setMarkingAll(true);
    try {
      const records = staffList.map((s) => ({ staffId: s._id, status: "present" }));
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAttendance(data);
      toast({ title: "Marked all present", description: `${staffList.length} staff marked present`, variant: "success" });
    } catch {
      toast({ title: "Error", description: "Failed to mark all present", variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };

  // Summary counts
  const presentCount = attendance.filter((a) => a.status === "present").length;
  const absentCount = attendance.filter((a) => a.status === "absent").length;
  const halfDayCount = attendance.filter((a) => a.status === "half-day").length;
  const unmarkedCount = staffList.length - attendance.length;

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };

  if (loading && staffList.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<CalendarCheck className="h-5 w-5" />}
          title="Attendance"
          subtitle="Daily staff attendance tracking"
          gradient={sectionThemes.attendance.gradient}
        />
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={<CalendarCheck className="h-5 w-5" />}
        title="Attendance"
        subtitle={`${isToday ? "Today" : formatDisplayDate(selectedDate)} \u2014 Daily staff attendance tracking`}
        gradient={sectionThemes.attendance.gradient}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 w-[170px]"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(getTodayIST())}>
                Today
              </Button>
            )}
          </div>
        }
      />

      {/* Mark All Present */}
      <div className="flex justify-end">
        <Button onClick={handleMarkAllPresent} disabled={markingAll}>
          <CalendarCheck className="h-4 w-4 mr-2" />
          {markingAll ? "Marking..." : "Mark All Present"}
        </Button>
      </div>

      {/* Summary Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-4"
      >
        <motion.div variants={fadeUpItem}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Present</p>
              <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Absent</p>
              <p className="text-2xl font-bold text-red-600">{absentCount}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Half-day</p>
              <p className="text-2xl font-bold text-amber-600">{halfDayCount}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeUpItem}>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Unmarked</p>
              <p className="text-2xl font-bold text-zinc-400">{unmarkedCount}</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Desktop Table View */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="text-left py-3 px-4 font-medium text-zinc-500">Staff Name</th>
                <th className="text-center py-3 px-4 font-medium text-zinc-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500">Note</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((staff) => {
                const status = getStaffStatus(staff._id);
                return (
                  <tr
                    key={staff._id}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold">
                          {staff.name.charAt(0)}
                        </div>
                        {staff.name}
                        {status && (
                          <Badge
                            variant={
                              status === "present" ? "success" : status === "absent" ? "destructive" : "default"
                            }
                            className={status === "half-day" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : ""}
                          >
                            {status}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant={status === "present" ? "default" : "outline"}
                          className={status === "present" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                          disabled={savingStaff === staff._id}
                          onClick={() => handleStatusChange(staff._id, "present")}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant={status === "absent" ? "destructive" : "outline"}
                          disabled={savingStaff === staff._id}
                          onClick={() => handleStatusChange(staff._id, "absent")}
                        >
                          Absent
                        </Button>
                        <Button
                          size="sm"
                          variant={status === "half-day" ? "default" : "outline"}
                          className={status === "half-day" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                          disabled={savingStaff === staff._id}
                          onClick={() => handleStatusChange(staff._id, "half-day")}
                        >
                          Half-day
                        </Button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Input
                        placeholder="Add note..."
                        value={notes[staff._id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [staff._id]: e.target.value }))}
                        onBlur={() => handleNoteBlur(staff._id)}
                        className="h-8 text-sm"
                      />
                    </td>
                  </tr>
                );
              })}
              {staffList.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-zinc-500">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No staff members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="block sm:hidden space-y-3"
      >
        {staffList.map((staff) => {
          const status = getStaffStatus(staff._id);
          return (
            <motion.div key={staff._id} variants={fadeUpItem}>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold">
                        {staff.name.charAt(0)}
                      </div>
                      <span className="font-medium">{staff.name}</span>
                    </div>
                    {status && (
                      <Badge
                        variant={
                          status === "present" ? "success" : status === "absent" ? "destructive" : "default"
                        }
                        className={status === "half-day" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : ""}
                      >
                        {status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={status === "present" ? "default" : "outline"}
                      className={`flex-1 ${status === "present" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                      disabled={savingStaff === staff._id}
                      onClick={() => handleStatusChange(staff._id, "present")}
                    >
                      Present
                    </Button>
                    <Button
                      size="sm"
                      variant={status === "absent" ? "destructive" : "outline"}
                      className="flex-1"
                      disabled={savingStaff === staff._id}
                      onClick={() => handleStatusChange(staff._id, "absent")}
                    >
                      Absent
                    </Button>
                    <Button
                      size="sm"
                      variant={status === "half-day" ? "default" : "outline"}
                      className={`flex-1 ${status === "half-day" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                      disabled={savingStaff === staff._id}
                      onClick={() => handleStatusChange(staff._id, "half-day")}
                    >
                      Half-day
                    </Button>
                  </div>
                  <Input
                    placeholder="Add note..."
                    value={notes[staff._id] || ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [staff._id]: e.target.value }))}
                    onBlur={() => handleNoteBlur(staff._id)}
                    className="h-8 text-sm"
                  />
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
        {staffList.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No staff members found
          </div>
        )}
      </motion.div>
    </div>
  );
}
