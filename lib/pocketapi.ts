// TCGdex API — Pokémon TCG Pocket cards
// Docs: https://tcgdex.dev/tcg-pocket
// All Pocket sets live under series "tcgp": A1 (Genetic Apex), A1a (Mythical Island),
// A2 (Space-Time Smackdown), A2b, A3, … new sets are added automatically.

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const TCGDEX_IMG  = "https://assets.tcgdex.net/en";

// Pocket rarity tiers, best first
// ♛ = Crown Rare, ☆☆☆ = Immersive, ☆☆ = Full Art, ☆ = EX/Star
const POCKET_RARITY_ORDER = ["♛", "☆☆☆", "☆☆", "☆"];

function rarityScore(rarity: string): number {
  const idx = POCKET_RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

interface TcgdexCard {
  id: string;           // e.g. "A1-001"
  localId: string;      // e.g. "001"
  name: string;
  image?: string;       // base URL without extension
  rarity?: string;
  set: { id: string };  // e.g. { id: "A1" }
}

async function fetchPocketCards(dexId: number): Promise<TcgdexCard[]> {
  try {
    const res = await fetch(
      `${TCGDEX_BASE}/cards?dexIds=${dexId}&series=tcgp`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    return (await res.json()) as TcgdexCard[];
  } catch { return []; }
}

function bestPocketCard(cards: TcgdexCard[]): TcgdexCard | null {
  const starred = cards.filter((c) => POCKET_RARITY_ORDER.includes(c.rarity ?? ""));
  if (!starred.length) return null;
  return starred.reduce((best, c) =>
    rarityScore(c.rarity!) < rarityScore(best.rarity!) ? c : best
  );
}

function cardImageUrl(card: TcgdexCard): string {
  // TCGdex image field is already a full base URL; append quality + format
  if (card.image) return `${card.image}/high.webp`;
  // Fallback: construct from set + localId
  return `${TCGDEX_IMG}/tcgp/${card.set.id}/${card.localId}/high.webp`;
}

export interface PocketResult { url: string | null }

export async function fetchPocketImages(
  pokemon: Array<{ id: number }>
): Promise<PocketResult[]> {
  const results = await Promise.all(
    pokemon.map(async ({ id }) => {
      const cards = await fetchPocketCards(id);
      const best  = bestPocketCard(cards);
      return { url: best ? cardImageUrl(best) : null };
    })
  );
  return results;
}
