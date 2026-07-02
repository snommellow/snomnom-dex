// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  Pocket series IDs: A1, A1a, A2, A2b, B1, B2, B2a, …


const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

const MAX_CONCURRENT = 20;
let _active = 0;
const _queue: Array<() => void> = [];
function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _active++;
      fn().then(resolve, reject).finally(() => {
        _active--;
        if (_queue.length > 0) _queue.shift()!();
      });
    };
    if (_active < MAX_CONCURRENT) run();
    else _queue.push(run);
  });
}

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
  types?: string[];
}

// Maps PokéAPI type names to Pocket TCG energy types.
// Poison maps to both Grass (e.g. Weedle, Caterpie) and Psychic (e.g. Nidoqueen, Zubat)
// because Pocket TCG splits Poison Pokémon across both energy types.
const POKEAPI_TO_TCG_TYPE: Record<string, string[]> = {
  normal:   ["Colorless"], fire:     ["Fire"],    water:    ["Water"],
  electric: ["Lightning"], grass:    ["Grass"],   ice:      ["Water"],
  fighting: ["Fighting"],  poison:   ["Grass", "Psychic", "Darkness"], ground: ["Fighting"],
  flying:   ["Colorless"], psychic:  ["Psychic"], bug:      ["Grass"],
  rock:     ["Fighting"],  ghost:    ["Psychic"], dragon:   ["Dragon"],
  dark:     ["Darkness"],  steel:    ["Metal"],   fairy:    ["Psychic"],
};

function isExcluded(cardName: string): boolean {
  return /^(mega |m |alolan |galarian |hisuian |paldean )/i.test(cardName);
}

async function fetchStarCards(name: string, rarity: string): Promise<TcgdexCard[]> {
  const url = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}&rarity=${encodeURIComponent(rarity)}`;
  return withRateLimit(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
        const res = await fetch(url, { next: { revalidate: 86400 } });
        if (res.status === 429 && attempt < 2) continue;
        if (!res.ok) return [];
        const json = await res.json();
        return (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
      } catch { if (attempt === 2) return []; }
    }
    return [];
  });
}

async function fetchCardDetail(id: string): Promise<TcgdexCard | null> {
  return withRateLimit(async () => {
    try {
      const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`, { next: { revalidate: 86400 } });
      if (!res.ok) return null;
      return await res.json() as TcgdexCard;
    } catch { return null; }
  });
}

function cardImageUrl(card: TcgdexCard): string {
  return `${card.image}/high.webp`;
}

export interface PocketResult { url: string | null }

function pickBestPocket(cards: Array<TcgdexCard & { rarity: string }>, chainSets?: Set<string>): PocketResult {
  if (!cards.length) return { url: null };

  // Only show rainbow-border Two Stars — these exist when a Pokémon appears as both
  // a regular card and an ex card (Two Star) in the same set. The higher localId is
  // the rainbow version. Singletons (no base form Two Star in the same set) are excluded.
  const setOf = (id: string) => id.split("-")[0];
  const twoStars = cards.filter((c) => c.rarity === "Two Star");
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
  pokemon: Array<{ id: number; name: string; gameTypes: string[] }>,
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ name, gameTypes }) => {
      const expectedTcgTypes = new Set(gameTypes.flatMap(t => POKEAPI_TO_TCG_TYPE[t] ?? ["Colorless"]));
      const results = await Promise.all(STAR_RARITIES.map((r) => fetchStarCards(name, r)));
      const nameLower = name.toLowerCase();
      const nameMatches = (cardName: string) => {
        const cn = cardName.toLowerCase();
        return cn === nameLower || cn.startsWith(nameLower + " ");
      };
      const prefiltered = STAR_RARITIES.flatMap((rarity, i) =>
        results[i]
          .filter((c) => c.image && nameMatches(c.name) && !isExcluded(c.name) && isPocketSet(setIdFromCardId(c.id)))
          .map((c) => ({ ...c, rarity }))
      );

      // Fetch card details to get types (list endpoint doesn't reliably return types field).
      // This catches mislabeled cards like Alolan Rattata appearing as "Rattata" in tcgdex.
      const detailed = await Promise.all(
        prefiltered.map(async (c) => {
          if (c.types?.length) return c;
          const detail = await fetchCardDetail(c.id);
          return detail ? { ...c, types: detail.types } : c;
        })
      );

      const cards = detailed.filter((c) => {
        if (c.types?.length && !c.types.some(t => expectedTcgTypes.has(t))) return false;
        return true;
      });
      return pickBestPocket(cards);
    })
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
  // For X/Y mega forms also try the base name without suffix (e.g. "Mega Mewtwo ex") in case
  // TCGdex omits the X/Y variant from the card name.
  const isXYForm = category === "mega" && (displayName.endsWith(" X") || displayName.endsWith(" Y"));
  const baseDisplayName = isXYForm ? displayName.replace(/ [XY]$/, "") : displayName;
  const baseNameLower = baseDisplayName.toLowerCase();
  // Pocket mega cards use "Mega Name ex" naming (e.g. "Mega Gyarados ex"), so accept
  // exact name match OR exact name + " ex" suffix.
  const matchesName = (cardName: string) => {
    const cn = cardName.toLowerCase();
    return cn === nameLower || cn === nameLower + " ex"
      || (isXYForm && (cn === baseNameLower || cn === baseNameLower + " ex"));
  };
  const queryNames = category === "mega"
    ? isXYForm
      ? [displayName, `${displayName} ex`, baseDisplayName, `${baseDisplayName} ex`]
      : [displayName, `${displayName} ex`]
    : [displayName];
  const allResults = await Promise.all(
    queryNames.flatMap(qName => STAR_RARITIES.map(r => fetchStarCards(qName, r)))
  );
  const exactResults = STAR_RARITIES.map((_, ri) =>
    queryNames.flatMap((_, qi) => allResults[qi * STAR_RARITIES.length + ri])
  );
  const exactCards = STAR_RARITIES.flatMap((rarity, i) =>
    exactResults[i]
      .filter((c) => c.image && matchesName(c.name))
      .map((c) => ({ ...c, rarity }))
  );
  if (exactCards.length) {
    const setOf = (id: string) => id.split("-")[0];
    const twoStars = exactCards.filter((c) => c.rarity === "Two Star");
    const bySet = Map.groupBy(twoStars, (c) => setOf(c.id));
    // For alt forms (mega/regional), include all Two Stars — no base form exists in the same set
    // to form a rainbow pair, so the singleton check would filter them all out.
    const isAltForm = category !== undefined;
    const rainbowTwoStars = isAltForm
      ? [...bySet.values()].map((group) => group.reduce((a, b) => parseInt(b.localId) > parseInt(a.localId) ? b : a))
      : [...bySet.values()]
          .filter((group) => group.length >= 2)
          .map((group) => group.reduce((a, b) => parseInt(b.localId) > parseInt(a.localId) ? b : a));
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

export async function fetchPocketFallback(
  pokemon: Array<{ id: number; name: string }>
): Promise<PocketResult[]> {
  return pokemon.map(() => ({ url: null }));
}

