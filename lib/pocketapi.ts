// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  Pocket series IDs: A1, A1a, A2, A2b, B1, B2, B2a, …

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

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

export async function fetchPocketImages(
  pokemon: Array<{ id: number; name: string }>
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ name }) => {
      // Fetch all star rarities in parallel, take highest available
      const results = await Promise.all(STAR_RARITIES.map((r) => fetchStarCards(name, r)));
      // Flatten, keep cards with images, attach rarity for scoring
      const cards = STAR_RARITIES.flatMap((rarity, i) =>
        results[i].filter((c) => c.image).map((c) => ({ ...c, rarity }))
      );
      if (!cards.length) return { url: null };
      const best = cards.reduce((a, b) =>
        (RARITY_SCORE[a.rarity ?? ""] ?? 99) <= (RARITY_SCORE[b.rarity ?? ""] ?? 99) ? a : b
      );
      return { url: cardImageUrl(best) };
    })
  );
}
