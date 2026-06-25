"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import PokemonCard from "./PokemonCard";

const ALL_TYPES = [
  "normal","fire","water","electric","grass","ice","fighting",
  "poison","ground","flying","psychic","bug","rock","ghost",
  "dragon","dark","steel","fairy",
] as const;

interface Props {
  pokemon: PokemonSummary[];
}

export default function PokedexClient({ pokemon }: Props) {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pokemon.filter((p) => {
      const matchesQuery =
        !q || p.name.includes(q) || p.types.some((t) => t.includes(q));
      const matchesType = !activeType || p.types.includes(activeType);
      return matchesQuery && matchesType;
    });
  }, [pokemon, query, activeType]);

  return (
    <div className="flex flex-col gap-5">
      {/* Search + count */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-900/50 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or type…"
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
          {filtered.length} / {pokemon.length} Pokémon
        </p>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveType(null)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
            activeType === null
              ? "bg-amber-900 text-white shadow"
              : "bg-amber-100/70 text-amber-900/70 hover:bg-amber-200/80"
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((type) => {
          const bg = TYPE_COLOR[type] ?? "#828282";
          const active = activeType === type;
          return (
            <button
              key={type}
              onClick={() => setActiveType(active ? null : type)}
              className="inline-flex items-center overflow-hidden rounded-full text-white uppercase font-extrabold tracking-[.06em] text-[9px] transition-all"
              style={{
                backgroundColor: bg,
                opacity: activeType && !active ? 0.45 : 1,
                padding: "3px 8px 3px 3px",
                textShadow: "0 1px 2px rgba(0,0,0,.4)",
                outline: active ? "2px solid white" : "none",
                outlineOffset: "1px",
                boxShadow: active ? `0 0 0 3px ${bg}` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typeIconUrl(type)}
                alt=""
                aria-hidden
                className="w-3.5 h-3.5 flex-shrink-0 mr-1 object-contain"
              />
              {type}
            </button>
          );
        })}
      </div>

      {/* Book shelf grid */}
      {filtered.length > 0 ? (
        <div
          className="grid gap-x-2 gap-y-8"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            /* Shelf line under each row */
            backgroundImage:
              "repeating-linear-gradient(transparent, transparent calc(100% - 6px), #7a4a1e calc(100% - 6px), #9a6030 100%)",
          }}
        >
          {filtered.map((p) => (
            <PokemonCard key={p.id} pokemon={p} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-amber-800/50 gap-3">
          <Search size={40} strokeWidth={1.5} />
          <p className="text-sm font-semibold">No Pokémon match your search.</p>
          <button
            onClick={() => { setQuery(""); setActiveType(null); }}
            className="text-xs text-red-600 hover:underline font-semibold"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
