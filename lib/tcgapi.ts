const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// Rarity tiers, best → worst. Lower index = higher priority.
const RARITY_PRIORITY = [
  "Special Illustration Rare",
  "Illustration Rare",
  "Ultra Rare",
  "Secret Rare",
];

// Only these rarities have true full-art / illustration-style card art
const HIGH_TIER_RARITIES = RARITY_PRIORITY;

function rarityScore(rarity: string): number {
  const idx = RARITY_PRIORITY.indexOf(rarity);
  return idx === -1 ? RARITY_PRIORITY.length : idx; // lower = better
}

interface TcgCard {
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  set: { releaseDate: string };
}

// Build a map of dex-number → best image URL from a list of API results.
// "Best" = highest rarity tier; ties broken by newest set release date.
function buildBestMap(cards: TcgCard[]): Map<number, string> {
  const best = new Map<number, { score: number; date: string; url: string }>();

  for (const card of cards) {
    const url = card.images?.large ?? card.images?.small;
    if (!url) continue;

    const score = rarityScore(card.rarity ?? "");
    const date = card.set?.releaseDate ?? "0000-00-00";

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const current = best.get(dexNum);
      const isBetter =
        !current ||
        score < current.score ||
        (score === current.score && date > current.date);

      if (isBetter) best.set(dexNum, { score, date, url });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, v.url]));
}

// Fire one TCG API request for a chunk of names with a rarity filter.
async function fetchChunk(
  names: string[],
  rarities: string[]
): Promise<TcgCard[]> {
  const nameClause = names.map((n) => `name:${n}`).join(" OR ");
  const rarityClause = rarities.map((r) => `rarity:"${r}"`).join(" OR ");
  const q = `(${nameClause}) (${rarityClause})`;

  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate&select=images,nationalPokedexNumbers,rarity,set`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data as TcgCard[]) ?? [];
  } catch {
    return [];
  }
}

// Fallback: any card for Pokémon that got no high-tier art
async function fetchFallbackChunk(names: string[]): Promise<TcgCard[]> {
  if (names.length === 0) return [];
  const nameClause = names.map((n) => `name:${n}`).join(" OR ");
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(nameClause)}&pageSize=250&orderBy=-set.releaseDate&select=images,nationalPokedexNumbers,rarity,set`,
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
 * Fetch the best TCG card image for each of the given Pokémon.
 *
 * Strategy:
 *   1. Split names into chunks of 75 → 2 parallel requests, each with the
 *      full high-tier rarity filter and orderBy=-set.releaseDate.
 *   2. Pick the best card per dex number (rarity score then newest date).
 *   3. For any Pokémon still without an image, fire a second-pass fallback
 *      query (no rarity filter) in one additional parallel request per chunk.
 *
 * Total requests: 2 (high-tier pass) + up to 2 (fallback pass) = ≤ 4,
 * down from the previous 151 individual requests.
 */
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<(string | null)[]> {
  const CHUNK = 75;

  // Capitalise to match TCG API expectations
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));

  // ── Pass 1: high-tier rarities in parallel chunks ──
  const chunks: typeof entries[] = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    chunks.push(entries.slice(i, i + CHUNK));
  }

  const pass1Results = await Promise.all(
    chunks.map((chunk) =>
      fetchChunk(
        chunk.map((e) => e.displayName),
        HIGH_TIER_RARITIES
      )
    )
  );

  const bestMap = buildBestMap(pass1Results.flat());

  // ── Pass 2: fallback for any Pokémon still missing an image ──
  const missingChunks: typeof entries[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const missing = chunks[i].filter((e) => !bestMap.has(e.id));
    if (missing.length > 0) missingChunks.push(missing);
  }

  if (missingChunks.length > 0) {
    const pass2Results = await Promise.all(
      missingChunks.map((chunk) =>
        fetchFallbackChunk(chunk.map((e) => e.displayName))
      )
    );
    const fallbackMap = buildBestMap(pass2Results.flat());
    fallbackMap.forEach((url, dexNum) => {
      if (!bestMap.has(dexNum)) bestMap.set(dexNum, url);
    });
  }

  return entries.map((e) => bestMap.get(e.id) ?? null);
}
