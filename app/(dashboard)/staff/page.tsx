"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Users, Search, BookOpen, Loader2, UserCog } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes } from "@/lib/theme";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface StaffMember {
  _id: string;
  name: string;
  phone: string;
  address: string;
  debtBalance: number;
}

export default function StaffPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const fetchStaff = (inactive?: boolean) => {
    setLoading(true);
    const url = (inactive ?? showInactive) ? "/api/staff?inactive=true" : "/api/staff";
    fetch(url)
      .then((r) => r.json())
      .then(setStaff)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStaff(); }, [showInactive]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      await fetch(`/api/staff/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Staff updated", description: `${form.name} has been updated`, variant: "success" });
    } else {
      await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Staff added", description: `${form.name} has been added`, variant: "success" });
    }

    setDialogOpen(false);
    setEditingId(null);
    setForm({ name: "", phone: "", address: "" });
    setSaving(false);
    fetchStaff();
  };

  const handleEdit = (member: StaffMember) => {
    setEditingId(member._id);
    setForm({ name: member.name, phone: member.phone, address: member.address });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/staff/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    toast({ title: "Staff deleted", description: "Staff member has been removed", variant: "destructive" });
    fetchStaff();
  };

  const filtered = staff.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<UserCog className="h-5 w-5" />}
          title="Staff Management"
          subtitle="Loading staff..."
          gradient={sectionThemes.staff.gradient}
        />
        <Skeleton className="h-10 w-full rounded-xl" />
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
      <PageHeader
        icon={<UserCog className="h-5 w-5" />}
        title="Staff Management"
        subtitle={`${staff.length} ${showInactive ? "inactive" : "active"} staff members`}
        gradient={sectionThemes.staff.gradient}
        actions={
          !showInactive ? (
            <Button onClick={() => { setEditingId(null); setForm({ name: "", phone: "", address: "" }); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Add Staff
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <button
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              !showInactive
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
            onClick={() => setShowInactive(false)}
          >
            Active
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              showInactive
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
            onClick={() => setShowInactive(true)}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="block sm:hidden space-y-3">
        <AnimatePresence>
          {filtered.map((member) => (
            <motion.div
              key={member._id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-zinc-500">{member.phone || "No phone"}</p>
                  </div>
                </div>
                <Badge variant={member.debtBalance > 0 ? "destructive" : "success"}>
                  {formatCurrency(member.debtBalance)}
                </Badge>
              </div>
              <div className="flex items-center justify-end gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <Link href={`/staff/${member._id}/ledger`}>
                  <Button variant="ghost" size="sm">
                    <BookOpen className="h-4 w-4" />
                    Ledger
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => handleEdit(member)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteConfirm(member._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {search ? "No staff found matching search" : "No staff members yet"}
          </div>
        )}
      </div>

      {/* Desktop table view */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Debt Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filtered.map((member) => (
                  <motion.tr
                    key={member._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold">
                          {member.name.charAt(0)}
                        </div>
                        {member.name}
                      </div>
                    </TableCell>
                    <TableCell>{member.phone || "—"}</TableCell>
                    <TableCell>{member.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={member.debtBalance > 0 ? "destructive" : "success"}>
                        {formatCurrency(member.debtBalance)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/staff/${member._id}/ledger`}>
                          <Button variant="ghost" size="icon" title="View Ledger">
                            <BookOpen className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(member)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirm(member._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-zinc-500">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {search ? "No staff found matching search" : "No staff members yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Staff" : "Add New Staff"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update staff member details" : "Add a new staff member to the system"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Enter staff name"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Enter address"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? "Update" : "Add"} Staff
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              Are you sure? This staff member will be deactivated and hidden from the system.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
