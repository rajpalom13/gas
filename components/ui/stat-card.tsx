import { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  iconBg?: string; // e.g. "bg-blue-100 dark:bg-blue-900/50"
  iconColor?: string; // e.g. "text-blue-600 dark:text-blue-400"
  className?: string;
}

export function StatCard({ icon, label, value, iconBg = "bg-zinc-100 dark:bg-zinc-800", iconColor = "text-zinc-600 dark:text-zinc-400", className = "" }: StatCardProps) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 transition-all hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 ${className}`}>
      <div className="flex items-start gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${iconBg} ${iconColor} shrink-0 transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
          <p className="text-xl font-bold tracking-tight mt-0.5 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}
