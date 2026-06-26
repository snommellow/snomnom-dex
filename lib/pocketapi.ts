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
    const res = await fetch(
      `${TCGDEX_BASE}/cards?dexId=${dexId}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      console.log(`[pocket dex${dexId}] HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    // TCGdex v2 may return bare array or { data: [...] }
    const all = (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
    console.log(`[pocket dex${dexId}] total cards: ${all.length}, sample sets:`, all.slice(0,3).map(c=>c.set?.id));
    const pocket = all.filter((c) => isPocketSet(c.set?.id ?? ""));
    if (pocket.length) console.log(`[pocket dex${dexId}] rarities:`, [...new Set(pocket.map(c => c.rarity))]);
    return pocket;
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
        rarityScore(a.rarity ?? "") <= rarityScore(b.rarity ?? "") ? a : b,
        cards[0]
      );
      return { url: cardImageUrl(best) };
    })
  );
}
