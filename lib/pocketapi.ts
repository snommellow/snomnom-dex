// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  series "tcgp": A1, A1a, A2, A2b, A3 … future sets auto-included

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// TCGdex uses English rarity names for Pocket cards, best → worst
const POCKET_RARITIES = ["Crown", "Three Star", "Two Star", "One Star"];

function rarityScore(rarity: string): number {
  const idx = POCKET_RARITIES.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

// Pocket set IDs all start with "A" (A1, A1a, A2, A2b, A3, …)
function isPocketSet(setId: string): boolean {
  return /^A\d/.test(setId);
}

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  set: { id: string };
}

async function fetchPocketCards(dexId: number): Promise<TcgdexCard[]> {
  try {
    // TCGdex filter: dexId=N returns all cards for that dex number across all sets
    const res = await fetch(
      `${TCGDEX_BASE}/cards?dexId=${dexId}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const all = (await res.json()) as TcgdexCard[];
    // Keep only TCG Pocket sets (set IDs starting with A) with a star rarity
    return all.filter(
      (c) => isPocketSet(c.set?.id ?? "") && POCKET_RARITIES.includes(c.rarity ?? "")
    );
  } catch { return []; }
}

function cardImageUrl(card: TcgdexCard): string {
  // image field is a full base URL — append quality + format
  if (card.image) return `${card.image}/high.webp`;
  return `https://assets.tcgdex.net/en/tcgp/${card.set.id}/${card.localId}/high.webp`;
}

export interface PocketResult { url: string | null }

export async function fetchPocketImages(
  pokemon: Array<{ id: number }>
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ id }) => {
      const cards = await fetchPocketCards(id);
      if (!cards.length) return { url: null };
      const best = cards.reduce((a, b) =>
        rarityScore(a.rarity ?? "") <= rarityScore(b.rarity ?? "") ? a : b
      );
      return { url: cardImageUrl(best) };
    })
  );
}
