"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Flame, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/lib/use-toast";

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "manager";
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "manager" });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;
      const res = await fetch(`/api/users/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "User updated", variant: "success" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: "User created", variant: "success" });
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    }

    setDialogOpen(false);
    setEditingId(null);
    setForm({ name: "", email: "", password: "", role: "manager" });
    setSaving(false);
    fetchUsers();
  };

  const handleEdit = (user: UserRecord) => {
    setEditingId(user._id);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "User deleted", variant: "destructive" });
    } else {
      const data = await res.json();
      toast({ title: "Error", description: data.error, variant: "destructive" });
    }
    setDeleteConfirm(null);
    fetchUsers();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">System configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
          <CardDescription>Your current login details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Name</span>
            <span className="text-sm font-medium">{session?.user?.name}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Email</span>
            <span className="text-sm font-medium">{session?.user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500">Role</span>
            <Badge variant="secondary" className="capitalize">{session?.user?.role}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Application</span>
            <span className="text-sm font-medium flex items-center gap-2">
              <Flame className="h-3 w-3" /> Gobind Bharat Gas V5
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Version</span>
            <span className="text-sm font-medium">1.0.0</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500">Technology</span>
            <span className="text-sm font-medium">Next.js + MongoDB</span>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">User Management</CardTitle>
                <CardDescription>Manage system users and their roles</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setForm({ name: "", email: "", password: "", role: "manager" });
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add User
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingUsers ? (
              <div className="p-6 text-center text-zinc-500">Loading users...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "secondary"} className="capitalize">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {user._id !== session?.user?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDeleteConfirm(user._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-zinc-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit User" : "Add New User"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update user details" : "Create a new system user"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{editingId ? "Password (leave blank to keep current)" : "Password *"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingId}
                placeholder={editingId ? "Leave blank to keep current" : "Enter password"}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? "Update" : "Create"} User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure? This user will be permanently removed from the system.
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
