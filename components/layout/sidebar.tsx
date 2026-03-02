"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Package,
  Users,
  Contact,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Flame,
  Menu,
  CircleDashed,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

const sectionColors: Record<string, { bg: string; text: string }> = {
  "/dashboard": { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-600 dark:text-blue-400" },
  "/inventory": { bg: "bg-indigo-50 dark:bg-indigo-950/30", text: "text-indigo-600 dark:text-indigo-400" },
  "/settlements": { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-400" },
  "/customers": { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-600 dark:text-orange-400" },
  "/empty-cylinders": { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-400" },
  "/staff": { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-600 dark:text-violet-400" },
  "/attendance": { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-600 dark:text-teal-400" },
  "/reports": { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-400" },
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/empty-cylinders", label: "Empty Cylinders", icon: CircleDashed },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/customers", label: "Customers", icon: Contact },
  { href: "/settlements", label: "Settlements", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <>
      <div className="flex items-center px-3 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20">
          <Flame className="h-5 w-5 text-white" />
        </div>
      </div>

      <TooltipProvider>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const colors = sectionColors[item.href];
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive && colors
                        ? `${colors.bg} ${colors.text}`
                        : isActive
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      <Separator />
      <div className="px-3 py-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <Avatar>
            <AvatarFallback>
              {session?.user?.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-zinc-500 hover:text-red-600"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-4 left-4 z-50 lg:hidden rounded-lg bg-white dark:bg-zinc-900 p-2 shadow-md border border-zinc-200 dark:border-zinc-800"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0 flex flex-col" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[260px] flex-col bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800">
        <NavContent />
      </aside>
    </>
  );
}
