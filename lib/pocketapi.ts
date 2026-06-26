// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  series "tcgp": A1, A1a, A2, A2b, A3 … future sets auto-included

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// Pocket set IDs all start with "A" (A1, A1a, A2, A2b, A3, …)
function isPocketSet(setId: string): boolean {
  return /^A\d/i.test(setId);
}

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  set: { id: string };
}

async function tcgdexFetch(url: string): Promise<TcgdexCard[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.log("[pocket] HTTP", res.status, url);
      return [];
    }
    const json = await res.json();
    return (Array.isArray(json) ? json : (json?.data ?? json?.cards ?? [])) as TcgdexCard[];
  } catch (e) {
    console.log("[pocket] fetch error:", String(e), url);
    return [];
  }
}

async function fetchPocketCards(dexId: number, name: string): Promise<TcgdexCard[]> {
  // Try multiple query strategies — TCGdex API parameter names vary
  const strategies = [
    `${TCGDEX_BASE}/cards?dexId=${dexId}`,
    `${TCGDEX_BASE}/cards?nationalPokedexNumber=${dexId}`,
    `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`,
  ];

  for (const url of strategies) {
    const all = await tcgdexFetch(url);
    console.log(`[pocket dex${dexId} "${name}"] url=${url.split("?")[1]} total=${all.length} sets=${[...new Set(all.map(c=>c.set?.id))].slice(0,5).join(",")}`);
    const pocket = all.filter((c) => isPocketSet(c.set?.id ?? ""));
    if (pocket.length) {
      console.log(`[pocket dex${dexId}] found ${pocket.length} pocket cards, rarities:`, [...new Set(pocket.map(c => c.rarity))]);
      return pocket;
    }
  }
  return [];
}

function cardImageUrl(card: TcgdexCard): string {
  if (card.image) return `${card.image}/high.webp`;
  return `https://assets.tcgdex.net/en/tcgp/${card.set.id}/${card.localId}/high.webp`;
}

export interface PocketResult { url: string | null }

// Rarity priority: best → worst
const POCKET_RARITY_ORDER = ["Crown Rare", "Crown", "☆☆☆", "Three Star", "☆☆", "Two Star", "☆", "One Star"];

function rarityScore(rarity: string): number {
  const idx = POCKET_RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

export async function fetchPocketImages(
  pokemon: Array<{ id: number; name: string }>
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ id, name }) => {
      const cards = await fetchPocketCards(id, name);
      if (!cards.length) return { url: null };
      const best = cards.reduce((a, b) =>
        rarityScore(a.rarity ?? "") <= rarityScore(b.rarity ?? "") ? a : b
      );
      return { url: cardImageUrl(best) };
    })
  );
}
