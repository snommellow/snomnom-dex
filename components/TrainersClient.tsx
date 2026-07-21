"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Search, X } from "lucide-react";
import type { TrainerEntry } from "@/lib/trainerapi";
import TrainerCard from "./TrainerCard";

const GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
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
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trainers…"
            className="w-full pl-9 pr-9 py-2 rounded-xl border border-white/15 bg-white/10 shadow-inner text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder:text-white/30"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <p className="text-xs font-semibold text-white/50 whitespace-nowrap">
          {filtered.length} / {trainers.length} Trainers
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="grid gap-x-3 gap-y-5" style={GRID_STYLE}>
          {filtered.map((t) => (
            <TrainerCard key={t.slug} trainer={t} onSelect={setSelected} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
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
            <div className="relative w-[280px] aspect-[5/7] rounded-2xl overflow-hidden shadow-2xl">
              <Image src={selected.imageUrl} alt={selected.name} fill sizes="280px" className="object-cover" unoptimized />
            </div>
            <p className="text-white font-bold text-lg">{selected.name}</p>
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
