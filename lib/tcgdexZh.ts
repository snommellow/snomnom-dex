// TCGdex API — Traditional Chinese (zh-tw) card database.
// Used only for region-exclusive promo sets that never got an English release
// (e.g. Hong Kong box-exclusive promos) — the vast majority of zh-tw sets are just
// Chinese-language prints of cards already available in English, so this is scoped
// to a curated list of genuinely exclusive set IDs rather than the whole catalogue.
// https://tcgdex.dev

const TCGDEX_ZH_BASE = "https://api.tcgdex.net/v2/zh-tw";

// Confirmed region-exclusive sets (not printed in any English-language set).
// SVHK = "未來密勒頓ex" (Hong Kong Scarlet & Violet box exclusive).
const EXCLUSIVE_SET_IDS = new Set(["SVHK"]);

interface TcgdexZhCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  set?: { id: string };
}

function setIdFromCardId(id: string): string { return id.split("-")[0] ?? ""; }

function cardImageUrl(card: TcgdexZhCard): string {
  return `${card.image}/high.webp`;
}

export interface ChineseExclusiveResult { url: string | null }

// Looked up by the Pokémon's Traditional Chinese name (from PokéAPI species data),
// since TCGdex's zh-tw card names aren't in English.
export async function fetchChineseExclusivePromo(chineseName: string | null): Promise<ChineseExclusiveResult> {
  if (!chineseName) return { url: null };
  const url = `${TCGDEX_ZH_BASE}/cards?name=${encodeURIComponent(chineseName)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return { url: null };
    const json = await res.json();
    const cards = (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexZhCard[];
    const exact = cards.filter(c =>
      c.name === chineseName && c.image && EXCLUSIVE_SET_IDS.has(setIdFromCardId(c.id))
    );
    if (!exact.length) return { url: null };
    return { url: cardImageUrl(exact[0]) };
  } catch { return { url: null }; }
}
