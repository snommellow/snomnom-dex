"use client";

import { useState, useMemo, useEffect, type CSSProperties } from "react";
import Image from "next/image";
import { Search, X, UserCircle } from "lucide-react";
import type { TrainerEntry } from "@/lib/trainerapi";
import TrainerCard from "./TrainerCard";

// Same fixed-width shelf grid as the Pokédex — never flexed wider to fill a row.
const SHELF_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  backgroundImage:
    "repeating-linear-gradient(transparent, transparent calc(100% - 6px), #7a4a1e calc(100% - 6px), #9a6030 100%)",
};

interface Props {
  trainers: TrainerEntry[];
}

export default function TrainersClient({ trainers }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TrainerEntry | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trainers;
    return trainers.filter((t) => t.name.toLowerCase().includes(q));
  }, [trainers, query]);

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-900/50 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trainers…"
            className="w-full pl-9 pr-9 py-2 rounded-xl border border-amber-800/30 bg-amber-50/80 shadow-inner text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder:text-amber-800/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-800/50 hover:text-amber-900"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <p className="text-xs font-semibold text-amber-900/60 whitespace-nowrap">
          {filtered.length} / {trainers.length} Trainers
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-x-3 gap-y-4" style={SHELF_GRID_STYLE}>
          {filtered.map((t) => (
            <TrainerCard key={t.slug} trainer={t} onSelect={setSelected} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-amber-800/50 gap-3">
          <Search size={40} strokeWidth={1.5} />
          <p className="text-sm font-semibold">No trainers match your search.</p>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}
        >
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-[240px] aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border-4 border-amber-100/80 bg-amber-900/20 flex items-center justify-center">
              {selected.imageUrl ? (
                <Image src={selected.imageUrl} alt={selected.name} fill sizes="240px" className="object-cover" />
              ) : (
                <UserCircle size={72} strokeWidth={1.25} className="text-amber-100/60" />
              )}
            </div>
            <p className="text-white font-bold text-lg">{selected.name}</p>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wide">{selected.role} · {selected.region}</p>
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X size={15} />
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
