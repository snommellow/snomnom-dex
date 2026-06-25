const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// Rarity tiers, best → worst.
const RARITY_PRIORITY = [
  "Special Illustration Rare",
  "Illustration Rare",
  "Ultra Rare",
  "Secret Rare",
];

function rarityScore(rarity: string): number {
  const idx = RARITY_PRIORITY.indexOf(rarity);
  return idx === -1 ? RARITY_PRIORITY.length : idx;
}

// Sets to prioritise for Gen 1 chain art (Scarlet & Violet 151, Crown Zenith)
const PRIORITY_SETS = ["sv3pt5", "swsh12pt5"];

interface TcgCard {
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  set: { id: string; releaseDate: string };
  subtypes: string[];
}

// Subtypes considered gimmick variants — excluded from results
const EXCLUDED_SUBTYPES = new Set([
  "MEGA", "V", "VMAX", "VSTAR", "EX", "GX", "Mega", "V-UNION",
]);

function isGimmickVariant(card: TcgCard): boolean {
  return (card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s));
}

function buildBestMap(cards: TcgCard[]): Map<number, string> {
  const best = new Map<
    number,
    { score: number; prioritySet: boolean; date: string; url: string }
  >();

  for (const card of cards) {
    if (isGimmickVariant(card)) continue;

    const url = card.images?.large ?? card.images?.small;
    if (!url) continue;

    const score = rarityScore(card.rarity ?? "");
    const prioritySet = PRIORITY_SETS.includes(card.set?.id ?? "");
    const date = card.set?.releaseDate ?? "0000-00-00";

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const current = best.get(dexNum);

      // Priority order: priority set > rarity score > newest date
      const isBetter =
        !current ||
        (!current.prioritySet && prioritySet) ||
        (current.prioritySet === prioritySet && score < current.score) ||
        (current.prioritySet === prioritySet &&
          score === current.score &&
          date > current.date);

      if (isBetter) best.set(dexNum, { score, prioritySet, date, url });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, v.url]));
}

const SUBTYPE_EXCLUSION =
  "-subtypes:mega -subtypes:vmax -subtypes:vstar -subtypes:v -subtypes:ex -subtypes:gx";

// Pass 1: priority sets (sv3pt5 + swsh12pt5) — chain art / illustration rares
async function fetchPrioritySets(names: string[]): Promise<TcgCard[]> {
  const nameClause = names.map((n) => `name:"${n}"`).join(" OR ");
  const setClause = PRIORITY_SETS.map((s) => `set.id:${s}`).join(" OR ");
  const q = `(${nameClause}) (${setClause}) ${SUBTYPE_EXCLUSION}`;

  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate&select=images,nationalPokedexNumbers,rarity,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data as TcgCard[]) ?? [];
  } catch {
    return [];
  }
}

// Pass 2: any set, high-tier rarities, for cards not found in priority sets
async function fetchHighTierChunk(names: string[]): Promise<TcgCard[]> {
  if (names.length === 0) return [];
  const nameClause = names.map((n) => `name:"${n}"`).join(" OR ");
  const rarityClause = RARITY_PRIORITY.map((r) => `rarity:"${r}"`).join(" OR ");
  const q = `(${nameClause}) (${rarityClause}) ${SUBTYPE_EXCLUSION}`;

  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate&select=images,nationalPokedexNumbers,rarity,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data as TcgCard[]) ?? [];
  } catch {
    return [];
  }
}

// Pass 3: no-rarity fallback for anything still missing
async function fetchFallbackChunk(names: string[]): Promise<TcgCard[]> {
  if (names.length === 0) return [];
  const nameClause = names.map((n) => `name:"${n}"`).join(" OR ");
  const q = `(${nameClause}) ${SUBTYPE_EXCLUSION}`;

  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate&select=images,nationalPokedexNumbers,rarity,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data as TcgCard[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch the best TCG card image for each Pokémon.
 *
 * Strategy (≤ 5 requests total):
 *   1. One request for priority sets (sv3pt5 + swsh12pt5) covering all 151 names.
 *   2. Remaining names split into ≤2 chunks → high-tier rarity pass (parallel).
 *   3. Still-missing → fallback pass (parallel, no rarity filter).
 */
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<(string | null)[]> {
  const CHUNK = 75;

  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));
  const allNames = entries.map((e) => e.displayName);

  // ── Pass 1: priority sets (all 151 names in one request) ──
  const pass1 = await fetchPrioritySets(allNames);
  const bestMap = buildBestMap(pass1);

  // ── Pass 2: high-tier rarity for anything not found in priority sets ──
  const missingAfterP1 = entries.filter((e) => !bestMap.has(e.id));
  const chunks: typeof entries[] = [];
  for (let i = 0; i < missingAfterP1.length; i += CHUNK) {
    chunks.push(missingAfterP1.slice(i, i + CHUNK));
  }

  if (chunks.length > 0) {
    const pass2Results = await Promise.all(
      chunks.map((chunk) => fetchHighTierChunk(chunk.map((e) => e.displayName)))
    );
    const p2Map = buildBestMap(pass2Results.flat());
    p2Map.forEach((url, id) => { if (!bestMap.has(id)) bestMap.set(id, url); });
  }

  // ── Pass 3: no-rarity fallback ──
  const missingAfterP2 = entries.filter((e) => !bestMap.has(e.id));
  const fallbackChunks: typeof entries[] = [];
  for (let i = 0; i < missingAfterP2.length; i += CHUNK) {
    fallbackChunks.push(missingAfterP2.slice(i, i + CHUNK));
  }

  if (fallbackChunks.length > 0) {
    const pass3Results = await Promise.all(
      fallbackChunks.map((chunk) =>
        fetchFallbackChunk(chunk.map((e) => e.displayName))
      )
    );
    const p3Map = buildBestMap(pass3Results.flat());
    p3Map.forEach((url, id) => { if (!bestMap.has(id)) bestMap.set(id, url); });
  }

  return entries.map((e) => bestMap.get(e.id) ?? null);
}
