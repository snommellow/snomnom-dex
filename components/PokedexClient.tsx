"use client";

import { useState, useMemo, useRef, useEffect, type CSSProperties } from "react";
import { Search, X, GitBranch, LayoutGrid, SlidersHorizontal } from "lucide-react";
import type { PokemonSummary, AltForm, DisplayCategory } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import PokemonCard, { AltFormCard } from "./PokemonCard";
import PokemonDetailModal from "./PokemonDetailModal";

// Filters use displayCategory (UI grouping), not category (card-search strategy) — see
// DisplayCategory in lib/pokeapi.ts for why those two differ. Mega/Primal/Origin Forme are
// grouped under one "Mega" chip per user request. "other" never appears on a real AltForm
// (filtered out upstream), so there's no catch-all chip needed beyond these four.
const ALT_FORM_FILTERS: { category: DisplayCategory; label: string }[] = [
  { category: "regional", label: "Regional" },
  { category: "mega", label: "Mega" },
  { category: "gmax", label: "Gigantamax" },
  { category: "forme", label: "Forme" },
];

type CardTypeFilter = "oldEx" | "cropped";
const CARD_TYPE_FILTERS: { key: CardTypeFilter; label: string }[] = [
  { key: "oldEx", label: "Old EX Cards" },
  { key: "cropped", label: "Cropped Cards" },
];

// Old-era "Pokémon-ex" cards (EX Ruby & Sapphire through EX Power Keepers — pokemontcg.io set
// ids "ex1".."ex16") — NOT the modern lowercase "ex" cards from the Scarlet & Violet era, which
// this filter leaves untouched.
const OLD_EX_SET_RE = /pokemontcg\.io\/ex\d+\//i;
function isOldExCard(url: string | null | undefined): boolean {
  return !!url && OLD_EX_SET_RE.test(url);
}

// Removes a disallowed card from an alt form; whatever's left just falls through the normal
// candidate chain, landing on the Pokémon's own official artwork if nothing else survives.
function applyCardTypeFilterToAltForm(f: AltForm, hidden: Set<CardTypeFilter>): AltForm {
  if (!hidden.size) return f;
  let tcgUrl = f.tcgUrl;
  let regularCardUrl = f.regularCardUrl;
  let cardRank = f.cardRank;
  if (hidden.has("oldEx")) {
    if (isOldExCard(tcgUrl)) { tcgUrl = null; cardRank = undefined; }
    if (isOldExCard(regularCardUrl)) regularCardUrl = null;
  }
  if (hidden.has("cropped") && !tcgUrl && regularCardUrl) regularCardUrl = null;
  if (tcgUrl === f.tcgUrl && regularCardUrl === f.regularCardUrl) return f;
  return { ...f, tcgUrl, regularCardUrl, cardRank };
}

function applyCardTypeFilterToPokemon(p: PokemonSummary, hidden: Set<CardTypeFilter>): PokemonSummary {
  if (!hidden.size) return p;
  let bgCandidates = p.bgCandidates;
  let regularCardUrl = p.regularCardUrl;
  let cardRank = p.cardRank;
  if (hidden.has("oldEx")) {
    const next = bgCandidates.filter((u) => !isOldExCard(u));
    if (next.length !== bgCandidates.length) { bgCandidates = next; cardRank = undefined; }
    if (isOldExCard(regularCardUrl)) regularCardUrl = undefined;
  }
  if (hidden.has("cropped") && bgCandidates.length === 0 && regularCardUrl) regularCardUrl = undefined;
  if (bgCandidates === p.bgCandidates && regularCardUrl === p.regularCardUrl) return p;
  return { ...p, bgCandidates, regularCardUrl, cardRank };
}

// When a category is hidden, its alt-form card/tab disappears from view. If the base entity has
// no full-art card of its own (no bgCandidates — every tier, IR/SIR, Pocket, Trainer IR/VGX,
// hardcode, VGX, and Tera IR/SIR, produces one when it wins), the base entity shows the hidden
// alt form's card instead of losing it entirely. But once the base already has ANY tier's
// full-art card, it's never second-guessed or swapped out — a hidden category never overrides
// an existing real card, no matter how the two would rank against each other.
function applyAltFormFilter(p: PokemonSummary, hidden: Set<DisplayCategory>): PokemonSummary {
  if (!p.altForms.length) return p;
  const visibleForms: AltForm[] = [];
  let bestHidden: AltForm | undefined;
  const baseHasCard = p.bgCandidates.length > 0;
  for (const f of p.altForms) {
    if (hidden.has(f.displayCategory)) {
      if (!baseHasCard && f.cardRank !== undefined && f.tcgUrl && (bestHidden?.cardRank === undefined || f.cardRank < bestHidden.cardRank)) {
        bestHidden = f;
      }
    } else {
      visibleForms.push(f);
    }
  }
  if (!baseHasCard && bestHidden?.tcgUrl) {
    return {
      ...p,
      altForms: visibleForms,
      bgCandidates: [bestHidden.tcgUrl],
      cardRank: bestHidden.cardRank,
    };
  }
  return visibleForms.length === p.altForms.length ? p : { ...p, altForms: visibleForms };
}

// Fixed-width cards, same as the normal dex order — never flexed wider to fill a row.
const SHELF_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  backgroundImage:
    "repeating-linear-gradient(transparent, transparent calc(100% - 6px), #7a4a1e calc(100% - 6px), #9a6030 100%)",
};

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
  const [familyView, setFamilyView] = useState(false);
  const [hiddenAltFormCategories, setHiddenAltFormCategories] = useState<Set<DisplayCategory>>(new Set());
  const [selected, setSelected] = useState<{ pokemon: PokemonSummary; formLabel?: string } | null>(null);
  const [hiddenCardTypes, setHiddenCardTypes] = useState<Set<CardTypeFilter>>(new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const activeFilterCount = (activeType ? 1 : 0) + hiddenAltFormCategories.size + hiddenCardTypes.size;

  useEffect(() => {
    if (!filterMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pokemon
      .filter((p) => {
        const matchesQuery =
          !q || p.name.includes(q) || p.types.some((t) => t.includes(q));
        const matchesType = !activeType || p.types.includes(activeType);
        return matchesQuery && matchesType;
      })
      .map((p) => {
        // Card-type filtering runs on alt forms first so a disallowed card can never win the
        // category-swap comparison below, then again on the (possibly swapped) base entity.
        const withFilteredForms = { ...p, altForms: p.altForms.map((f) => applyCardTypeFilterToAltForm(f, hiddenCardTypes)) };
        const withCategoryFilter = applyAltFormFilter(withFilteredForms, hiddenAltFormCategories);
        return applyCardTypeFilterToPokemon(withCategoryFilter, hiddenCardTypes);
      });
  }, [pokemon, query, activeType, hiddenAltFormCategories, hiddenCardTypes]);

  // Family view: group by evolution family, families ordered by their lowest dex number,
  // members within a family ordered by evolution stage (baby → basic → stage 1 → stage 2).
  // All base evolution stages come first, then all alt forms (Mega/Gigantamax/regional)
  // after, in the same row — not interleaved per-stage.
  const families = useMemo(() => {
    if (!familyView) return null;
    const groups = new Map<number, PokemonSummary[]>();
    for (const p of filtered) {
      const group = groups.get(p.familyId);
      if (group) group.push(p);
      else groups.set(p.familyId, [p]);
    }
    for (const group of groups.values()) group.sort((a, b) => a.familyOrder - b.familyOrder);
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([familyId, members]) => {
        const items = [
          ...members.map((p) => ({ kind: "base" as const, key: `${p.id}`, pokemon: p })),
          ...members.flatMap((p) =>
            (p.altForms ?? [])
              .map((f) => ({ kind: "form" as const, key: f.slug, form: f, baseId: p.id, genus: p.genus }))
          ),
        ];
        return { familyId, items };
      });
  }, [filtered, familyView]);

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
            type="text"
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

        {/* Combined Type + Alt Forms filter popup */}
        <div className="relative inline-block" ref={filterMenuRef}>
          <button
            onClick={() => setFilterMenuOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              activeFilterCount > 0
                ? "bg-amber-900 text-white shadow"
                : "bg-amber-100/70 text-amber-900/70 hover:bg-amber-200/80"
            }`}
            aria-expanded={filterMenuOpen}
            aria-haspopup="menu"
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-amber-900 text-[9px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>
          {filterMenuOpen && (
            <div
              role="menu"
              className="absolute z-20 mt-1.5 left-0 w-72 rounded-xl border border-amber-800/20 bg-white shadow-lg p-3 flex flex-col gap-3"
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-900/50 mb-1.5">Type</p>
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
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-900/50 mb-1.5">Alt Forms</p>
                <div className="flex flex-col gap-0.5">
                  {ALT_FORM_FILTERS.map(({ category, label }) => {
                    const hidden = hiddenAltFormCategories.has(category);
                    return (
                      <button
                        key={category}
                        role="menuitemcheckbox"
                        aria-checked={!hidden}
                        onClick={() =>
                          setHiddenAltFormCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(category)) next.delete(category);
                            else next.add(category);
                            return next;
                          })
                        }
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          hidden ? "text-amber-900/40" : "text-amber-950 hover:bg-amber-100/70"
                        }`}
                      >
                        <span className={hidden ? "line-through" : ""}>{label}</span>
                        {!hidden && <span className="text-red-600 text-[10px] font-black">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-900/50 mb-1.5">Card Type</p>
                <div className="flex flex-col gap-0.5">
                  {CARD_TYPE_FILTERS.map(({ key, label }) => {
                    const hidden = hiddenCardTypes.has(key);
                    return (
                      <button
                        key={key}
                        role="menuitemcheckbox"
                        aria-checked={!hidden}
                        onClick={() =>
                          setHiddenCardTypes((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          hidden ? "text-amber-900/40" : "text-amber-950 hover:bg-amber-100/70"
                        }`}
                      >
                        <span className={hidden ? "line-through" : ""}>{label}</span>
                        {!hidden && <span className="text-red-600 text-[10px] font-black">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setFamilyView((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            familyView
              ? "bg-amber-900 text-white shadow"
              : "bg-amber-100/70 text-amber-900/70 hover:bg-amber-200/80"
          }`}
          aria-pressed={familyView}
          title={familyView ? "Show dex order" : "Group by evolution family"}
        >
          {familyView ? <LayoutGrid size={14} /> : <GitBranch size={14} />}
          {familyView ? "Dex order" : "Family view"}
        </button>
      </div>

      {/* Book shelf grid */}
      {filtered.length > 0 ? (
        families ? (
          <div className="flex flex-col gap-5">
            {families.map(({ familyId, items }) => (
              <div key={familyId} className="grid gap-x-3 gap-y-4" style={SHELF_GRID_STYLE}>
                {items.map((item) =>
                  item.kind === "base" ? (
                    <PokemonCard key={item.key} pokemon={item.pokemon} onSelect={(pokemon, formLabel) => setSelected({ pokemon, formLabel })} />
                  ) : (
                    <AltFormCard key={item.key} form={item.form} baseId={item.baseId} genus={item.genus} onSelect={(pokemon, formLabel) => setSelected({ pokemon, formLabel })} />
                  )
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-x-3 gap-y-4" style={SHELF_GRID_STYLE}>
            {filtered.flatMap((p) => [
              <PokemonCard key={p.id} pokemon={p} onSelect={(pokemon, formLabel) => setSelected({ pokemon, formLabel })} />,
              ...(p.altForms ?? []).map((form) => (
                <AltFormCard key={form.slug} form={form} baseId={p.id} genus={p.genus} onSelect={(pokemon, formLabel) => setSelected({ pokemon, formLabel })} />
              )),
            ])}
          </div>
        )
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

      {selected && (
        <PokemonDetailModal
          pokemon={selected.pokemon}
          formLabel={selected.formLabel}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
