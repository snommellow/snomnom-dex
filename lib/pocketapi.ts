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

function isMega(cardName: string): boolean {
  return /^(mega |m )/i.test(cardName);
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
        results[i].filter((c) => c.image && !isMega(c.name)).map((c) => ({ ...c, rarity }))
      );
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
        .map((group) => group.reduce((a, b) =>
          parseInt(b.localId) > parseInt(a.localId) ? b : a
        ));

      const eligible = [
        ...cards.filter((c) => c.rarity !== "Two Star"),
        ...rainbowTwoStars,
      ];
      if (!eligible.length) return { url: null };

      const best = eligible.reduce((a, b) => {
        const ra = RARITY_SCORE[a.rarity ?? ""] ?? 99;
        const rb = RARITY_SCORE[b.rarity ?? ""] ?? 99;
        if (ra !== rb) return ra <= rb ? a : b;
        return parseInt(b.localId) > parseInt(a.localId) ? b : a;
      });
      return { url: cardImageUrl(best) };
    })
  );
}
