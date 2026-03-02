import { ReactNode } from "react";

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  gradient: string; // e.g. "from-blue-600 to-blue-400"
}

export function PageHeader({ icon, title, subtitle, badge, actions, gradient }: PageHeaderProps) {
  return (
    <div className="relative mb-6">
      {/* Gradient accent bar */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient} rounded-t-lg`} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
        <div className="flex items-center gap-3">
          {/* Icon pill */}
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg shadow-black/10`}>
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
