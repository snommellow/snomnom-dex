const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── TCG card images (pokemontcg.io) ──────────────────────────────────────────

const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
// V/GX full-art cards span multiple rarity names depending on set era
const VGX_RARITIES = new Set(["Ultra Rare", "Rare Ultra", "Rare Secret", "Secret Rare"]);

function subtypeScore(subtypes: string[]): number {
  // Lower = better: V Alternate Art beats GX beats EX (regular V already filtered out above)
  if (subtypes.includes("V")) return 0;
  if (subtypes.includes("GX")) return 1;
  if (subtypes.includes("EX")) return 2;
  return 3;
}
const JUNK_RARITIES = new Set(["Common", "Uncommon", "Promo", "Rare", "Rare Holo"]);

// Gen 1 evolution chains — used to detect sets with connected chain artwork
const GEN1_CHAINS: number[][] = [
  [1,2,3],[4,5,6],[7,8,9],[10,11,12],[13,14,15],[16,17,18],[19,20],[21,22],
  [23,24],[25,26],[27,28],[29,30,31],[32,33,34],[35,36],[37,38],[39,40],
  [41,42],[43,44,45],[46,47],[48,49],[50,51],[52,53],[54,55],[56,57],[58,59],
  [60,61,62],[63,64,65],[66,67,68],[69,70,71],[72,73],[74,75,76],[77,78],
  [79,80],[81,82],[84,85],[86,87],[88,89],[90,91],[92,93,94],[96,97],[98,99],
  [100,101],[102,103],[104,105],[109,110],[111,112],[116,117],[118,119],
  [120,121],[129,130],[133,134,135,136],[138,139],[140,141],[147,148,149],
];

// Returns: setId → set of dex numbers that belong to a complete 3-stage chain in that set
function buildChainDexMap(cards: TcgCard[]): Map<string, Set<number>> {
  const setCoverage = new Map<string, Set<number>>();
  for (const card of cards) {
    const sid = card.set?.id;
    if (!sid) continue;
    if (!setCoverage.has(sid)) setCoverage.set(sid, new Set());
    for (const d of card.nationalPokedexNumbers ?? []) setCoverage.get(sid)!.add(d);
  }
  const result = new Map<string, Set<number>>();
  for (const [sid, dexNums] of setCoverage) {
    const chainDex = new Set<number>();
    for (const chain of GEN1_CHAINS) {
      if (chain.length >= 3 && chain.every((d) => dexNums.has(d))) {
        chain.forEach((d) => chainDex.add(d));
      }
    }
    if (chainDex.size > 0) result.set(sid, chainDex);
  }
  return result;
}



interface TcgCard {
  id: string;
  name: string;
  number: string;
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  supertype: string;
  set: { id: string; releaseDate: string };
  subtypes: string[];
}

const EXCLUDED_SUBTYPES = new Set([
  "MEGA", "Mega", "VMAX", "VSTAR", "V-UNION", "Tera",
]);
const GIMMICK_RE = /\b(MEGA|VMAX|VSTAR|V-UNION)\b/i;
const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;

function isGimmick(card: TcgCard): boolean {
  if ((card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s))) return true;
  if (GIMMICK_RE.test(card.name)) return true;
  // Trainer cards have no dex numbers so they're filtered by buildBestMap already,
  // but exclude explicitly for safety
  if (card.supertype === "Trainer") return true;
  return false;
}

// Pokémon whose only V cards are gold-border Full Art (not bleed-edge Alternate Art).
// Add dex numbers here as they're discovered. These Pokémon skip V cards in the VGX pass
// and fall through to GX/EX or placeholder instead.
const V_GOLDBORDER_BLOCKLIST = new Set([
  12, // Butterfree — only has gold-border Full Art V
]);

function rarityScore(rarity: string): number {
  const order = ["Special Illustration Rare", "Illustration Rare", "Ultra Rare", "Secret Rare", "Rare Holo", "Rare"];
  const idx = order.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

export interface TcgImageResult { tcgUrl: string | null }

// Trainer-owned cards have a possessive in the name e.g. "Lillie's Clefairy"
const TRAINER_OWNED_RE = /'\s*s\s+/i;

function buildBestMap(
  cards: TcgCard[],
  allowedRarities: Set<string>,
  allowGimmick = false,
  useSubtypeScore = false,
): Map<number, TcgImageResult> {
  const chainDexMap = buildChainDexMap(cards);
  const best = new Map<number, { chain: boolean; score: number; sub: number; date: string; tcgUrl: string | null }>();

  for (const card of cards) {
    if (REGIONAL_RE.test(card.name)) continue;
    if (!allowGimmick && isGimmick(card)) continue;
    if (TRAINER_OWNED_RE.test(card.name)) continue;
    if (JUNK_RARITIES.has(card.rarity ?? "") || !card.rarity) continue;
    if (!allowedRarities.has(card.rarity)) continue;
    // Skip gold-border Full Art V for blocklisted Pokémon (no Alternate Art available)
    const subs = card.subtypes ?? [];
    if (subs.includes("V") && !subs.includes("Alternate Art")) {
      const dexNums = card.nationalPokedexNumbers ?? [];
      if (dexNums.every((n) => V_GOLDBORDER_BLOCKLIST.has(n))) continue;
    }

    const tcgUrl = card.images?.large ?? card.images?.small ?? null;
    const score = rarityScore(card.rarity);
    const sub = useSubtypeScore ? subtypeScore(card.subtypes ?? []) : 99;
    const sid = card.set?.id ?? "";
    const date = card.set?.releaseDate ?? "0000-00-00";

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const chain = chainDexMap.get(sid)?.has(dexNum) ?? false;
      const cur = best.get(dexNum);
      const better =
        !cur ||
        score < cur.score ||
        (score === cur.score && sub < cur.sub) ||
        (score === cur.score && sub === cur.sub && !cur.chain && chain) ||
        (score === cur.score && sub === cur.sub && cur.chain === chain && date > cur.date);
      if (better) best.set(dexNum, { chain, score, sub, date, tcgUrl });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, { tcgUrl: v.tcgUrl }]));
}

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,number,images,nationalPokedexNumbers,rarity,supertype,set,subtypes`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return ((await res.json()).data as TcgCard[]) ?? [];
  } catch { return []; }
}

const IR_CLAUSE = `(rarity:"Special Illustration Rare" OR rarity:"Illustration Rare")`;
// Target V and GX full-art cards; exclude SV ex, VMAX, VSTAR, Mega, Trainer
const VGX_CLAUSE = `(subtypes:V OR subtypes:GX) -subtypes:VMAX -subtypes:VSTAR -subtypes:ex -supertype:Trainer`;
const SUB_EXCL  = `-subtypes:mega -subtypes:vmax -subtypes:vstar -subtypes:tera -supertype:Trainer`;
const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// PokéAPI slugs → pokemontcg.io display names
const NAME_OVERRIDES: Record<string, string> = {
  "nidoran-f": "Nidoran ♀",
  "nidoran-m": "Nidoran ♂",
  "mr-mime":   "Mr. Mime",
  "farfetchd": "Farfetch'd",
  "ho-oh":     "Ho-Oh",
};

function toDisplayName(slug: string): string {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

const dexQ = (dexIds: number[]) =>
  dexIds.map((id) => `nationalPokedexNumbers:${id}`).join(" OR ");

// Pass 1: IR/SIR — best quality full-art cards, no gimmick forms
export async function fetchTcgIrSir(
  ids: number[]
): Promise<Map<number, TcgImageResult>> {
  const results = await Promise.all(
    chunk(ids, CHUNK).map((batch) =>
      tcgFetch(`(${dexQ(batch)}) ${IR_CLAUSE} ${SUB_EXCL}`)
    )
  );
  return buildBestMap(results.flat(), IR_RARITIES, false);
}

// Pass 3: V/GX/EX fallback for Pokémon still missing after IR/SIR + Pocket
export async function fetchTcgVgx(
  ids: number[]
): Promise<Map<number, TcgImageResult>> {
  if (!ids.length) return new Map();
  const results = await Promise.all(
    chunk(ids, CHUNK).map((batch) =>
      tcgFetch(`(${dexQ(batch)}) ${VGX_CLAUSE}`)
    )
  );
  return buildBestMap(results.flat(), VGX_RARITIES, true, true /* useSubtypeScore */);
}

// Convenience wrapper (kept for any callers that want all passes at once)
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<TcgImageResult[]> {
  const ids = pokemon.map((p) => p.id);
  const irMap = await fetchTcgIrSir(ids);
  const missingIds = ids.filter((id) => !irMap.has(id));
  const vgxMap = await fetchTcgVgx(missingIds);
  return ids.map((id) => irMap.get(id) ?? vgxMap.get(id) ?? { tcgUrl: null });
}
