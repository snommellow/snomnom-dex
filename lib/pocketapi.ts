// TCGdex API — Pokémon TCG Pocket cards
// https://tcgdex.dev  |  Pocket series IDs: A1, A1a, A2, A2b, B1, B2, B2a, …

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// Pocket set IDs start with A or B followed by a digit (A1, A2b, B1, B2a, …)
function isPocketSet(setId: string): boolean {
  return /^[AB]\d/i.test(setId);
}

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  set: { id: string };
}

// Prefer ex/full-art cards over plain cards within Pocket results
function pocketCardScore(card: TcgdexCard): number {
  const n = card.name.toLowerCase();
  if (n.includes(" ex")) return 0;   // e.g. "Beedrill ex"
  if (n.includes("-ex")) return 1;
  return 2;
}

async function fetchPocketCards(name: string): Promise<TcgdexCard[]> {
  try {
    const res = await fetch(
      `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const all = (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
    return all.filter((c) => isPocketSet(c.set?.id ?? "") && c.image);
  } catch { return []; }
}

function cardImageUrl(card: TcgdexCard): string {
  if (card.image) return `${card.image}/high.webp`;
  return `https://assets.tcgdex.net/en/tcgp/${card.set.id}/${card.localId}/high.webp`;
}

export interface PocketResult { url: string | null }

export async function fetchPocketImages(
  pokemon: Array<{ id: number; name: string }>
): Promise<PocketResult[]> {
  return Promise.all(
    pokemon.map(async ({ name }) => {
      const cards = await fetchPocketCards(name);
      if (!cards.length) return { url: null };
      const best = cards.reduce((a, b) =>
        pocketCardScore(a) <= pocketCardScore(b) ? a : b
      );
      return { url: cardImageUrl(best) };
    })
  );
}
