"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Package, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { PageHeader } from "@/components/ui/page-header";
import { sectionThemes, getCylinderColor } from "@/lib/theme";

interface InventoryItem {
  _id: string;
  cylinderSize: string;
  fullStock: number;
  emptyStock: number;
  pricePerUnit: number;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<InventoryItem>>({});
  const [saving, setSaving] = useState(false);

  // Add cylinder dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCylinderSize, setNewCylinderSize] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Delete cylinder state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchInventory = () => {
    fetch("/api/inventory")
      .then((r) => r.json())
      .then(setInventory)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleEdit = (item: InventoryItem) => {
    setEditing(item._id);
    setEditValues({
      fullStock: item.fullStock,
      emptyStock: item.emptyStock,
      pricePerUnit: item.pricePerUnit,
    });
  };

  const handleSave = async (cylinderSize: string) => {
    setSaving(true);
    await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cylinderSize, ...editValues }),
    });
    setEditing(null);
    setSaving(false);
    toast({ title: "Inventory updated", description: `${cylinderSize} cylinder stock updated`, variant: "success" });
    fetchInventory();
  };

  const handleAdd = async () => {
    setAddError("");
    setAddLoading(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cylinderSize: newCylinderSize,
          pricePerUnit: parseFloat(newPrice),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error || "Failed to add cylinder type");
        setAddLoading(false);
        return;
      }
      setShowAddDialog(false);
      setNewCylinderSize("");
      setNewPrice("");
      setAddError("");
      toast({ title: "Cylinder type added", description: `${newCylinderSize} added to inventory`, variant: "success" });
      fetchInventory();
    } catch {
      setAddError("Failed to add cylinder type");
    }
    setAddLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/inventory?cylinderSize=${encodeURIComponent(deleteTarget)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Failed to delete cylinder type");
        setDeleteLoading(false);
        return;
      }
      setDeleteTarget(null);
      setDeleteError("");
      toast({ title: "Cylinder type deleted", description: `${deleteTarget} removed from inventory`, variant: "success" });
      fetchInventory();
    } catch {
      setDeleteError("Failed to delete cylinder type");
    }
    setDeleteLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<Package className="h-5 w-5" />}
          title="Inventory"
          subtitle="Manage cylinder stock and prices"
          gradient={sectionThemes.inventory.gradient}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Package className="h-5 w-5" />}
        title="Inventory"
        subtitle="Manage cylinder stock and prices"
        gradient={sectionThemes.inventory.gradient}
        badge={
          <Badge variant="secondary" className="gap-1">
            <Package className="h-3 w-3" />
            {inventory.reduce((a, i) => a + i.fullStock + i.emptyStock, 0)} total
          </Badge>
        }
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Cylinder Type
            </Button>
          ) : undefined
        }
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2"
      >
        {inventory.map((item, idx) => {
          const cylColor = getCylinderColor(idx);
          return (
          <motion.div
            key={item._id}
            variants={fadeUpItem}
          >
            <Card className={`hover:shadow-md transition-shadow border-l-4 ${cylColor.border}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-lg ${cylColor.bg} flex items-center justify-center`}>
                      <Package className={`h-4 w-4 ${cylColor.text}`} />
                    </div>
                    {item.cylinderSize} Cylinder
                  </CardTitle>
                  {editing !== item._id ? (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        Edit
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(item.cylinderSize)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleSave(item.cylinderSize)}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editing === item._id ? (
                  <div className={`grid gap-3 ${isAdmin ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                    <div>
                      <Label className="text-xs">Full Stock</Label>
                      <Input
                        type="number"
                        value={editValues.fullStock ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, fullStock: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Empty Stock</Label>
                      <Input
                        type="number"
                        value={editValues.emptyStock ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, emptyStock: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    {isAdmin && (
                      <div>
                        <Label className="text-xs">Price per Unit</Label>
                        <Input
                          type="number"
                          value={editValues.pricePerUnit ?? ""}
                          onChange={(e) => setEditValues({ ...editValues, pricePerUnit: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                      <p className="text-xs text-zinc-500 mb-1">Full</p>
                      <p className="text-xl font-bold text-emerald-600">{item.fullStock}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                      <p className="text-xs text-zinc-500 mb-1">Empty</p>
                      <p className="text-xl font-bold text-amber-600">{item.emptyStock}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800">
                      <p className="text-xs text-zinc-500 mb-1">Price</p>
                      <p className="text-xl font-bold">{formatCurrency(item.pricePerUnit)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
          );
        })}
      </motion.div>

      {/* Add Cylinder Type Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) { setAddError(""); setNewCylinderSize(""); setNewPrice(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cylinder Type</DialogTitle>
            <DialogDescription>Add a new cylinder type to your inventory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="cylinderSize">Cylinder Size</Label>
              <Input
                id="cylinderSize"
                placeholder="e.g. 25kg"
                value={newCylinderSize}
                onChange={(e) => setNewCylinderSize(e.target.value)}
              />
              <p className="text-xs text-zinc-500 mt-1">Format: number + unit (kg, lb, ltr)</p>
            </div>
            <div>
              <Label htmlFor="pricePerUnit">Price per Unit</Label>
              <Input
                id="pricePerUnit"
                type="number"
                placeholder="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            {addError && (
              <p className="text-sm text-red-500">{addError}</p>
            )}
            <Button
              onClick={handleAdd}
              disabled={addLoading || !newCylinderSize || !newPrice}
              className="w-full"
            >
              {addLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Cylinder Type
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-red-500">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
