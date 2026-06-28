// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  Pocket series IDs: A1, A1a, A2, A2b, B1, B2, B2a, …

import { buildChainSets } from "./chains";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// Pocket set IDs start with A or B followed by a digit
function isPocketSet(setId: string): boolean {
  return /^[AB]\d/i.test(setId);
}
function setIdFromCardId(id: string): string { return id.split("-")[0] ?? ""; }
// Newer set = alphabetically greater (A1 < A1a < A2 < A2b < B1 < B2 < B2a)
function newerSet(a: string, b: string): string { return a > b ? a : b; }
function pickNewest<T extends TcgdexCard>(a: T, b: T): T {
  const aSet = setIdFromCardId(a.id);
  const bSet = setIdFromCardId(b.id);
  if (aSet !== bSet) return newerSet(aSet, bSet) === bSet ? b : a;
  return parseInt(b.localId) > parseInt(a.localId) ? b : a;
}

// Only show star-rarity cards (1★, 2★, 3★) — not diamond commons or Crown rares
const STAR_RARITIES = ["One Star", "Two Star", "Three Star"] as const;

// Score by star count: 3★ beats 2★ beats 1★ (lower = better)
const RARITY_SCORE: Record<string, number> = {
  "Three Star": 0,
  "Two Star": 1,
  "One Star": 2,
};

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  set?: { id: string };
}

function isExcluded(cardName: string): boolean {
  return /^(mega |m |alolan |galarian |hisuian |paldean )/i.test(cardName);
}

async function fetchStarCards(name: string, rarity: string): Promise<TcgdexCard[]> {
  try {
    const res = await fetch(
      `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}&rarity=${encodeURIComponent(rarity)}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
  } catch { return []; }
}

function cardImageUrl(card: TcgdexCard): string {
  return `${card.image}/high.webp`;
}

export interface PocketResult { url: string | null }

function pickBestPocket(cards: Array<TcgdexCard & { rarity: string }>, chainSets?: Set<string>): PocketResult {
  if (!cards.length) return { url: null };

  // Two Star cards come in two visual groups per set: a plain full-art group and
  // a rainbow-border group at higher localIds. The rainbow-border version only
  // exists when the same Pokémon appears ≥2 times as Two Star within the same set.
  // Filter Two Stars to only the rainbow-border duplicates; drop Two Star entirely
  // if no rainbow-border version exists for this Pokémon in any set.
  const twoStars = cards.filter((c) => c.rarity === "Two Star");
  const setOf = (id: string) => id.split("-")[0];
  const bySet = Map.groupBy(twoStars, (c) => setOf(c.id));
  const rainbowTwoStars = [...bySet.values()]
    .filter((group) => group.length >= 2)
    .map((group) => group.reduce((a, b) => pickNewest(a, b)));

  const eligible = [
    ...cards.filter((c) => c.rarity !== "Two Star"),
    ...rainbowTwoStars,
  ];
  if (!eligible.length) return { url: null };

  const pickFrom = (pool: typeof eligible) =>
    pool.reduce((a, b) => {
      const ra = RARITY_SCORE[a.rarity ?? ""] ?? 99;
      const rb = RARITY_SCORE[b.rarity ?? ""] ?? 99;
      if (ra !== rb) return ra <= rb ? a : b;
      return pickNewest(a, b);
    });

  if (chainSets?.size) {
    const chainEligible = eligible.filter(c => chainSets.has(setOf(c.id)));
    if (chainEligible.length) return { url: cardImageUrl(pickFrom(chainEligible)) };
  }
  return { url: cardImageUrl(pickFrom(eligible)) };
}

export async function fetchPocketImages(
  pokemon: Array<{ id: number; name: string }>,
  chainsByDex: Map<number, number[]> = new Map(),
): Promise<PocketResult[]> {
  // Fetch all candidates first to enable chain-set detection
  const candidatesList = await Promise.all(
    pokemon.map(async ({ name }) => {
      const results = await Promise.all(STAR_RARITIES.map((r) => fetchStarCards(name, r)));
      const nameLower = name.toLowerCase();
      const nameMatches = (cardName: string) => {
        const cn = cardName.toLowerCase();
        return cn === nameLower || cn.startsWith(nameLower + " ");
      };
      return STAR_RARITIES.flatMap((rarity, i) =>
        results[i]
          .filter((c) => c.image && nameMatches(c.name) && !isExcluded(c.name))
          .map((c) => ({ ...c, rarity }))
      );
    })
  );

  const setOf = (id: string) => id.split("-")[0];
  const setsByDex = new Map(
    pokemon.map((p, i) => [p.id, new Set(candidatesList[i].map(c => setOf(c.id)))])
  );
  const chainSetsMap = buildChainSets(setsByDex, chainsByDex);

  return candidatesList.map((cards, i) =>
    pickBestPocket(cards, chainSetsMap.get(pokemon[i].id))
  );
}

// Pocket star-card lookup for alt forms.
// For regional forms: queries exact display name ("Alolan Raichu"), bypassing isExcluded.
// For mega forms: falls back to base Pokémon name when no exact match found, since
// Pocket EX cards use the base name (e.g. "Gyarados ex" for Mega Gyarados).
export async function fetchPocketAltForm(
  displayName: string,
  category: string,
): Promise<PocketResult> {
  const nameLower = displayName.toLowerCase();
  // Pocket mega cards use "Mega Name ex" naming (e.g. "Mega Gyarados ex"), so accept
  // exact name match OR exact name + " ex" suffix.
  const matchesName = (cardName: string) => {
    const cn = cardName.toLowerCase();
    return cn === nameLower || cn === nameLower + " ex";
  };
  const exactResults = await Promise.all(STAR_RARITIES.map((r) => fetchStarCards(displayName, r)));
  const exactCards = STAR_RARITIES.flatMap((rarity, i) =>
    exactResults[i]
      .filter((c) => c.image && matchesName(c.name))
      .map((c) => ({ ...c, rarity }))
  );
  if (exactCards.length) {
    // Apply same Two Star rainbow filter as fetchPocketImages
    const twoStars = exactCards.filter((c) => c.rarity === "Two Star");
    const setOf = (id: string) => id.split("-")[0];
    const bySet = Map.groupBy(twoStars, (c) => setOf(c.id));
    const rainbowTwoStars = [...bySet.values()]
      .filter((group) => group.length >= 2)
      .map((group) => group.reduce((a, b) =>
        parseInt(b.localId) > parseInt(a.localId) ? b : a
      ));
    const eligible = [
      ...exactCards.filter((c) => c.rarity !== "Two Star"),
      ...rainbowTwoStars,
    ];
    if (!eligible.length) return { url: null };
    const best = eligible.reduce((a, b) => {
      const ra = RARITY_SCORE[a.rarity ?? ""] ?? 99;
      const rb = RARITY_SCORE[b.rarity ?? ""] ?? 99;
      if (ra !== rb) return ra <= rb ? a : b;
      return pickNewest(a, b);
    });
    return { url: cardImageUrl(best) };
  }
  return { url: null };
}

// Pass 4 fallback: any Pocket card (including commons) for Pokémon with no high-quality card
async function fetchAnyPocketCards(name: string): Promise<TcgdexCard[]> {
  try {
    const res = await fetch(
      `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const all = (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
    return all.filter((c) => isPocketSet(setIdFromCardId(c.id)) && c.image);
  } catch { return []; }
}

export async function fetchPocketFallback(
  pokemon: Array<{ id: number; name: string }>
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ name }) => {
      const nameLower = name.toLowerCase();
      const cards = await fetchAnyPocketCards(name);
      const matched = cards.filter((c) => {
        const cn = c.name.toLowerCase();
        return (cn === nameLower || cn.startsWith(nameLower + " ")) && !isExcluded(c.name);
      });
      if (!matched.length) return { url: null };
      // Prefer ex cards (full-art), then pick highest localId
      const exCards = matched.filter((c) => c.name.toLowerCase().includes(" ex"));
      const pool = exCards.length ? exCards : matched;
      const best = pool.reduce((a, b) =>
        parseInt(b.localId) > parseInt(a.localId) ? b : a
      );
      return { url: cardImageUrl(best) };
    })
  );
}
