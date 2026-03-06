"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface CategoryComboboxProps {
  type: "addon" | "deduction";
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  onCategoryCreated?: (name: string) => void;
}

export function CategoryCombobox({
  type,
  value,
  onChange,
  categories,
  onCategoryCreated,
}: CategoryComboboxProps) {
  const [search, setSearch] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = categories.filter((cat) =>
    cat.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = categories.some(
    (cat) => cat.toLowerCase() === search.toLowerCase()
  );

  const selectCategory = (cat: string) => {
    setSearch(cat);
    onChange(cat);
    setIsOpen(false);
  };

  const createCategory = async () => {
    const name = search.trim();
    if (!name) return;
    try {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      onCategoryCreated?.(name);
      selectCategory(name);
    } catch {
      // Silently fail, user can retry
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Select or type..."
        className="w-full"
      />
      {isOpen && (filtered.length > 0 || (search.trim() && !exactMatch)) && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((cat) => (
            <button
              key={cat}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              onClick={() => selectCategory(cat)}
            >
              {cat}
            </button>
          ))}
          {search.trim() && !exactMatch && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors border-t border-zinc-200 dark:border-zinc-800"
              onClick={createCategory}
            >
              Create &quot;{search.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
