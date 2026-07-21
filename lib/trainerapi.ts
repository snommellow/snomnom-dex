// pokemontcg.io Trainer/Supporter card catalog — doubles as both the name list and the
// artwork source for the Trainers page, since PokeAPI has no trainer data or sprites at all
// (verified: zero trainer resources, and PokeAPI/sprites has no trainer image path).

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

interface PtcgCard {
  id: string;
  number: string;
  name: string;
  rarity: string;
  set: { id: string };
  images: { small: string; large: string | null };
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null }> };
}

export interface TrainerEntry {
  name: string;
  slug: string;
  imageUrl: string;
}

// Same rarity-tier idea as the Pokémon pipeline's RARITY_ORDER, but scoped to what Supporter
// cards actually carry — full-art illustration tiers first, then holo/secret tiers, then plain.
const SUPPORTER_RARITY_ORDER = [
  "Special Illustration Rare",
  "Illustration Rare",
  "Hyper Rare",
  "Rare Secret",
  "Rare Shiny",
  "Rare Holo",
  "Rare Holo Star",
  "Rare Ultra",
  "Rare",
  "Uncommon",
  "Common",
  "Promo",
];

function rarityScore(rarity: string): number {
  const idx = SUPPORTER_RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

function marketPrice(card: PtcgCard): number {
  const prices = card.tcgplayer?.prices;
  if (!prices) return 0;
  return Math.max(0, ...Object.values(prices).map((p) => p?.market ?? p?.mid ?? 0));
}

function cardImageUrl(card: PtcgCard): string {
  return card.images.large ?? card.images.small;
}

function pickBestCard(cards: PtcgCard[]): PtcgCard | null {
  if (!cards.length) return null;
  return cards.reduce((a, b) => {
    const ra = rarityScore(a.rarity), rb = rarityScore(b.rarity);
    if (ra !== rb) return ra < rb ? a : b;
    const pa = marketPrice(a), pb = marketPrice(b);
    if (pa !== pb) return pb > pa ? b : a;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    const aNum = parseInt(a.number) || 0, bNum = parseInt(b.number) || 0;
    return bNum >= aNum ? b : a;
  });
}

async function fetchAllPages(q: string): Promise<PtcgCard[]> {
  const results: PtcgCard[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,set,images,tcgplayer`;
    let data: PtcgCard[] | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text) throw new Error("empty body");
        data = JSON.parse(text).data;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

export function toTrainerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Fetches every Supporter card, groups by name, and picks the best card per trainer —
// the same rank-then-tiebreak-by-price shape as pickBestCard in tcgapi.ts.
export async function fetchTrainerEntries(): Promise<TrainerEntry[]> {
  const cards = await fetchAllPages("supertype:Trainer subtypes:Supporter");
  const byName = new Map<string, PtcgCard[]>();
  for (const c of cards) {
    if (!c.images?.large) continue;
    const list = byName.get(c.name);
    if (list) list.push(c);
    else byName.set(c.name, [c]);
  }
  const entries: TrainerEntry[] = [];
  for (const [name, group] of byName) {
    const best = pickBestCard(group);
    if (best) entries.push({ name, slug: toTrainerSlug(name), imageUrl: cardImageUrl(best) });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}
