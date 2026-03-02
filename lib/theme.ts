// Section theme colors for each page/module
export const sectionThemes = {
  dashboard: {
    gradient: "from-blue-600 to-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-600 dark:text-blue-400",
    accent: "bg-blue-100 dark:bg-blue-900/40",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
  },
  inventory: {
    gradient: "from-indigo-600 to-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    border: "border-indigo-200 dark:border-indigo-800",
    text: "text-indigo-600 dark:text-indigo-400",
    accent: "bg-indigo-100 dark:bg-indigo-900/40",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/50",
  },
  settlements: {
    gradient: "from-emerald-600 to-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-600 dark:text-emerald-400",
    accent: "bg-emerald-100 dark:bg-emerald-900/40",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
  },
  customers: {
    gradient: "from-orange-600 to-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-600 dark:text-orange-400",
    accent: "bg-orange-100 dark:bg-orange-900/40",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
  },
  emptyCylinders: {
    gradient: "from-amber-600 to-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400",
    accent: "bg-amber-100 dark:bg-amber-900/40",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
  },
  staff: {
    gradient: "from-violet-600 to-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    text: "text-violet-600 dark:text-violet-400",
    accent: "bg-violet-100 dark:bg-violet-900/40",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
  },
  reports: {
    gradient: "from-rose-600 to-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-rose-200 dark:border-rose-800",
    text: "text-rose-600 dark:text-rose-400",
    accent: "bg-rose-100 dark:bg-rose-900/40",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
  },
  attendance: {
    gradient: "from-teal-600 to-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-200 dark:border-teal-800",
    text: "text-teal-600 dark:text-teal-400",
    accent: "bg-teal-100 dark:bg-teal-900/40",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
  },
} as const;

export type SectionKey = keyof typeof sectionThemes;

// Palette of colors for individual cylinder types
const cylinderPalette = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-200 dark:ring-blue-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-800" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-300 dark:border-amber-700", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-800" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300", ring: "ring-purple-200 dark:ring-purple-800" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", border: "border-rose-300 dark:border-rose-700", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-200 dark:ring-rose-800" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", border: "border-cyan-300 dark:border-cyan-700", text: "text-cyan-700 dark:text-cyan-300", ring: "ring-cyan-200 dark:ring-cyan-800" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-200 dark:ring-orange-800" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-indigo-300 dark:border-indigo-700", text: "text-indigo-700 dark:text-indigo-300", ring: "ring-indigo-200 dark:ring-indigo-800" },
];

export function getCylinderColor(index: number) {
  return cylinderPalette[index % cylinderPalette.length];
}

export function buildCylinderColorMap(sizes: string[]) {
  const map: Record<string, typeof cylinderPalette[0]> = {};
  sizes.forEach((size, i) => {
    map[size] = getCylinderColor(i);
  });
  return map;
}
