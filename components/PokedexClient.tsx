"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_DOT } from "@/lib/typeColors";
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
    <div className="flex flex-col gap-6">
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or type…"
            className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder:text-gray-400"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-sm text-gray-500 whitespace-nowrap">
          {filtered.length} / {pokemon.length} Pokémon
        </p>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveType(null)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            activeType === null
              ? "bg-gray-800 text-white"
              : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(activeType === type ? null : type)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
              activeType === type
                ? "bg-gray-800 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT[type] ?? "bg-gray-400"}`}
            />
            {type}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((p) => (
            <PokemonCard key={p.id} pokemon={p} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <Search size={40} strokeWidth={1.5} />
          <p className="text-sm font-medium">No Pokémon match your search.</p>
          <button
            onClick={() => { setQuery(""); setActiveType(null); }}
            className="text-xs text-red-500 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
