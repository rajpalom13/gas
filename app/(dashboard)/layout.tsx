"use client";
import { Sidebar } from "@/components/layout/sidebar";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { pageTransition } from "@/lib/animations";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Sidebar />
        <main className="lg:pl-[260px]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 pt-16 lg:pt-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={pageTransition.initial}
                animate={pageTransition.animate}
                exit={pageTransition.exit}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
