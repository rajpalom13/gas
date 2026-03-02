"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Contact, Search, Loader2, Banknote, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "@/lib/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Customer {
  _id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  cashDebt: number;
  cylinderDebts: Array<{ cylinderSize: string; quantity: number }>;
}

export default function CustomersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Pay Debt dialog state
  const [payDebtOpen, setPayDebtOpen] = useState(false);
  const [payDebtCustomer, setPayDebtCustomer] = useState<Customer | null>(null);
  const [debtType, setDebtType] = useState<"cash" | "cylinder">("cash");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtCylinderSize, setDebtCylinderSize] = useState("");
  const [debtCylinderQty, setDebtCylinderQty] = useState("");
  const [payingDebt, setPayingDebt] = useState(false);

  const fetchCustomers = () => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data) => setCustomers(data.customers || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      await fetch(`/api/customers/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Customer updated", description: `${form.name} has been updated`, variant: "success" });
    } else {
      await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({ title: "Customer added", description: `${form.name} has been added`, variant: "success" });
    }

    setDialogOpen(false);
    setEditingId(null);
    setForm({ name: "", phone: "", address: "", notes: "" });
    setSaving(false);
    fetchCustomers();
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer._id);
    setForm({ name: customer.name, phone: customer.phone, address: customer.address, notes: customer.notes });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    toast({ title: "Customer deleted", description: "Customer has been removed", variant: "destructive" });
    fetchCustomers();
  };

  const openPayDebt = (customer: Customer) => {
    setPayDebtCustomer(customer);
    setDebtType(customer.cashDebt > 0 ? "cash" : "cylinder");
    setDebtAmount("");
    setDebtCylinderSize(customer.cylinderDebts.length > 0 ? customer.cylinderDebts[0].cylinderSize : "");
    setDebtCylinderQty("");
    setPayDebtOpen(true);
  };

  const handlePayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebtCustomer) return;
    setPayingDebt(true);

    const body: Record<string, unknown> = { type: debtType };
    if (debtType === "cash") {
      body.amount = parseFloat(debtAmount);
    } else {
      body.cylinderSize = debtCylinderSize;
      body.quantity = parseInt(debtCylinderQty);
    }

    const res = await fetch(`/api/customers/${payDebtCustomer._id}/debt-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast({ title: "Debt payment recorded", description: "Customer debt has been updated", variant: "success" });
      setPayDebtOpen(false);
      setPayDebtCustomer(null);
      fetchCustomers();
    } else {
      const data = await res.json();
      toast({ title: "Error", description: data.error || "Failed to record payment", variant: "destructive" });
    }
    setPayingDebt(false);
  };

  const hasDebt = (c: Customer) => (c.cashDebt || 0) > 0 || (c.cylinderDebts && c.cylinderDebts.length > 0);

  const formatCylinderDebts = (debts: Array<{ cylinderSize: string; quantity: number }>) => {
    if (!debts || debts.length === 0) return null;
    return debts.filter(d => d.quantity > 0).map(d => `${d.quantity}x ${d.cylinderSize}`).join(", ");
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<Users className="h-5 w-5" />}
          title="Customer Database"
          subtitle="Loading customers..."
          gradient={sectionThemes.customers.gradient}
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
        icon={<Users className="h-5 w-5" />}
        title="Customer Database"
        subtitle={`${customers.length} active customers`}
        gradient={sectionThemes.customers.gradient}
        badge={
          <Badge variant="secondary" className="gap-1">
            {customers.length} customers
          </Badge>
        }
        actions={
          <Button onClick={() => { setEditingId(null); setForm({ name: "", phone: "", address: "", notes: "" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Mobile card view */}
      <div className="block sm:hidden space-y-3">
        <AnimatePresence>
          {filtered.map((customer) => (
            <motion.div
              key={customer._id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 flex items-center justify-center text-sm font-bold">
                    {customer.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-xs text-zinc-500">{customer.phone || "No phone"}</p>
                  </div>
                </div>
              </div>
              {customer.address && (
                <p className="text-xs text-zinc-500">{customer.address}</p>
              )}
              {customer.notes && (
                <p className="text-xs text-zinc-400 truncate">{customer.notes}</p>
              )}
              {/* Debt info */}
              {hasDebt(customer) && (
                <div className="flex flex-wrap gap-2">
                  {(customer.cashDebt || 0) > 0 && (
                    <Badge variant="destructive">{formatCurrency(customer.cashDebt)} cash</Badge>
                  )}
                  {formatCylinderDebts(customer.cylinderDebts) && (
                    <Badge variant="warning">{formatCylinderDebts(customer.cylinderDebts)}</Badge>
                  )}
                </div>
              )}
              <div className="flex items-center justify-end gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                {hasDebt(customer) && (
                  <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700" onClick={() => openPayDebt(customer)}>
                    <Banknote className="h-4 w-4" />
                    Pay Debt
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(customer)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteConfirm(customer._id)}
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
            <Contact className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {search ? "No customers found matching search" : "No customers yet"}
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
                <TableHead>Cash Debt</TableHead>
                <TableHead>Cylinder Debt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filtered.map((customer) => (
                  <motion.tr
                    key={customer._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${
                      hasDebt(customer) ? "bg-red-50/40 dark:bg-red-950/20" : ""
                    }`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 flex items-center justify-center text-xs font-bold">
                          {customer.name.charAt(0)}
                        </div>
                        {customer.name}
                      </div>
                    </TableCell>
                    <TableCell>{customer.phone || "\u2014"}</TableCell>
                    <TableCell>{customer.address || "\u2014"}</TableCell>
                    <TableCell>
                      {(customer.cashDebt || 0) > 0 ? (
                        <span className="text-red-600 font-medium">{formatCurrency(customer.cashDebt)}</span>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell>
                      {formatCylinderDebts(customer.cylinderDebts) ? (
                        <div className="flex gap-1 flex-wrap">
                          {customer.cylinderDebts.filter(d => d.quantity > 0).map((d, i) => (
                            <Badge key={i} variant="warning" className="text-[10px]">
                              {d.quantity}x {d.cylinderSize}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {hasDebt(customer) && (
                          <Button variant="ghost" size="icon" className="text-emerald-600 hover:text-emerald-700" onClick={() => openPayDebt(customer)}>
                            <Banknote className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirm(customer._id)}
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
                  <TableCell colSpan={6} className="text-center py-12 text-zinc-500">
                    <Contact className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {search ? "No customers found matching search" : "No customers yet"}
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
            <DialogTitle>{editingId ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update customer details" : "Add a new customer to the database"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Enter customer name"
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
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any notes about this customer"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? "Update" : "Add"} Customer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure? This customer will be deactivated and hidden from the system.
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

      {/* Pay Debt Dialog */}
      <Dialog open={payDebtOpen} onOpenChange={setPayDebtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay Debt</DialogTitle>
            <DialogDescription>
              Record a debt payment for {payDebtCustomer?.name}.
              {payDebtCustomer && (payDebtCustomer.cashDebt || 0) > 0 && (
                <> Cash debt: {formatCurrency(payDebtCustomer.cashDebt)}.</>
              )}
              {payDebtCustomer && formatCylinderDebts(payDebtCustomer.cylinderDebts) && (
                <> Cylinder debt: {formatCylinderDebts(payDebtCustomer.cylinderDebts)}.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayDebt} className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <Select value={debtType} onValueChange={(v) => setDebtType(v as "cash" | "cylinder")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {payDebtCustomer && (payDebtCustomer.cashDebt || 0) > 0 && (
                    <SelectItem value="cash">Cash</SelectItem>
                  )}
                  {payDebtCustomer && payDebtCustomer.cylinderDebts && payDebtCustomer.cylinderDebts.length > 0 && (
                    <SelectItem value="cylinder">Cylinder</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {debtType === "cash" && (
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  min={1}
                  max={payDebtCustomer?.cashDebt || 0}
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  required
                  placeholder={`Max: ${formatCurrency(payDebtCustomer?.cashDebt || 0)}`}
                />
              </div>
            )}

            {debtType === "cylinder" && (
              <>
                <div className="space-y-2">
                  <Label>Cylinder Size *</Label>
                  <Select value={debtCylinderSize} onValueChange={setDebtCylinderSize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {payDebtCustomer?.cylinderDebts?.filter(d => d.quantity > 0).map((d) => (
                        <SelectItem key={d.cylinderSize} value={d.cylinderSize}>
                          {d.cylinderSize} (owed: {d.quantity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min={1}
                    max={payDebtCustomer?.cylinderDebts?.find(d => d.cylinderSize === debtCylinderSize)?.quantity || 1}
                    value={debtCylinderQty}
                    onChange={(e) => setDebtCylinderQty(e.target.value)}
                    required
                    placeholder="Number of cylinders returned"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPayDebtOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={payingDebt}>
                {payingDebt ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Record Payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
