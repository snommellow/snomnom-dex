const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── TCG card images (pokemontcg.io) ──────────────────────────────────────────

// Unified rarity priority order — shared by both main and alt form card lookups
const RARITY_ORDER = [
  "Special Illustration Rare", "Illustration Rare",
  "Secret Rare", "Rare Secret", "Trainer Gallery Rare Holo",
  "Ultra Rare", "Rare Ultra",
  "Rare Holo EX", "Holo Rare EX", "Rare Holo GX", "Holo Rare GX",
  "Rare Holo V",
];

export const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
export const VGX_RARITIES = new Set([
  "Secret Rare", "Rare Secret", "Trainer Gallery Rare Holo",
  "Ultra Rare", "Rare Ultra",
  "Rare Holo EX", "Holo Rare EX", "Rare Holo GX", "Holo Rare GX",
  "Rare Holo V",
]);

function subtypeScore(subtypes: string[]): number {
  // Lower = better: VSTAR > VMAX > GX > EX > V Alternate Art > regular V
  if (subtypes.includes("VSTAR")) return 0;
  if (subtypes.includes("VMAX")) return 1;
  if (subtypes.includes("GX")) return 2;
  if (subtypes.includes("EX")) return 3;
  if (subtypes.includes("V") && subtypes.includes("Alternate Art")) return 4;
  if (subtypes.includes("V")) return 5;
  return 6;
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
  types?: string[];
  legalities?: { standard?: string; expanded?: string; unlimited?: string };
  rules?: string[];
}

const EXCLUDED_SUBTYPES = new Set([
  "MEGA", "Mega", "VMAX", "VSTAR", "V-UNION", "Tera",
]);
const GIMMICK_RE = /\b(MEGA|VMAX|VSTAR|V-UNION)\b/i;
const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;

const TERA_RULE_RE = /^tera[:\s]/i;

function isGimmick(card: TcgCard): boolean {
  if ((card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s))) return true;
  if (GIMMICK_RE.test(card.name)) return true;
  if (REGIONAL_RE.test(card.name)) return true;
  // Tera cards don't always have "Tera" in subtypes — check the rule box instead
  if ((card.rules ?? []).some((r) => TERA_RULE_RE.test(r))) return true;
  // Trainer cards have no dex numbers so they're filtered by buildBestMap already,
  // but exclude explicitly for safety
  if (card.supertype === "Trainer") return true;
  return false;
}

// Pokémon whose only V cards are gold-border Full Art (not bleed-edge Alternate Art).
// Add dex numbers here as they're discovered. These Pokémon skip V cards in the VGX pass
// and fall through to GX/EX or placeholder instead.
const V_GOLDBORDER_BLOCKLIST = new Set<number>([]);

function rarityScore(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

export interface TcgImageResult { tcgUrl: string | null }

const TRAINER_OWNED_RE = /'\s*s\s+/i;

function buildBestMap(
  cards: TcgCard[],
  allowedRarities: Set<string>,
  allowGimmick = false,
  useSubtypeScore = false,
  preferLowerNumber = false,
  allowTrainerOwned = false,
): Map<number, TcgImageResult> {
  const chainDexMap = buildChainDexMap(cards);
  const best = new Map<number, { chain: boolean; score: number; sub: number; date: string; num: number; tcgUrl: string | null }>();

  for (const card of cards) {
    if (REGIONAL_RE.test(card.name)) continue;
    if (!allowGimmick && isGimmick(card)) continue;
    if (!allowTrainerOwned && TRAINER_OWNED_RE.test(card.name)) continue;
    if (!card.rarity) continue;
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
    const num = parseInt(card.number ?? "0", 10) || 0;

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const chain = chainDexMap.get(sid)?.has(dexNum) ?? false;
      const cur = best.get(dexNum);
      const better =
        !cur ||
        score < cur.score ||
        (score === cur.score && sub < cur.sub) ||
        (score === cur.score && sub === cur.sub && !cur.chain && chain) ||
        (score === cur.score && sub === cur.sub && cur.chain === chain && date > cur.date) ||
        (score === cur.score && sub === cur.sub && cur.chain === chain && date === cur.date && (preferLowerNumber ? num < cur.num : num > cur.num));
      if (better) best.set(dexNum, { chain, score, sub, date, num, tcgUrl });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, { tcgUrl: v.tcgUrl }]));
}

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,number,images,nationalPokedexNumbers,rarity,supertype,set,subtypes,types,legalities,rules`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return ((await res.json()).data as TcgCard[]) ?? [];
  } catch { return []; }
}

const IR_CLAUSE = `(rarity:"Special Illustration Rare" OR rarity:"Illustration Rare")`;
// Target VSTAR, VMAX, V, GX full-art cards; exclude SV ex, Mega, Trainer
const VGX_CLAUSE = `(subtypes:VSTAR OR subtypes:VMAX OR subtypes:V OR subtypes:GX) -subtypes:ex -supertype:Trainer`;
const SUB_EXCL  = `-subtypes:mega -subtypes:vmax -subtypes:vstar -subtypes:tera -supertype:Trainer`;
// Promo full-art passes
const PROMO_SV_CLAUSE   = `rarity:Promo set.series:"Scarlet & Violet" ${SUB_EXCL}`;
// swshp excluded until we can reliably filter its non-full-art stamp promos
const PROMO_OLDER_SETS: string[] = [];
const PROMO_OLDER_CLAUSE = PROMO_OLDER_SETS.length
  ? `rarity:Promo (${PROMO_OLDER_SETS.map(s => `set.id:${s}`).join(" OR ")}) ${SUB_EXCL}`
  : "";
const PROMO_RARITIES = new Set(["Promo"]);
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

// Pass 1.1: trainer-owned IR/SIR (e.g. "Erika's Clefable") — for Pokémon with no non-trainer IR/SIR
export async function fetchTcgTrainerOwnedIrSir(
  ids: number[]
): Promise<Map<number, TcgImageResult>> {
  if (!ids.length) return new Map();
  const results = await Promise.all(
    chunk(ids, CHUNK).map((batch) =>
      tcgFetch(`(${dexQ(batch)}) ${IR_CLAUSE} ${SUB_EXCL}`)
    )
  );
  return buildBestMap(results.flat(), IR_RARITIES, false, false, false, true);
}

// Known non-full-art SVP stamp/retro reprints to exclude
const SVP_BLACKLIST = new Set(["svp-11", "svp-24", "svp-159", "svp-167", "svp-168", "svp-169"]);

// Pass 1.5: SV-era full-art promos (svp + any future SV promo sets)
export async function fetchTcgPromoSv(
  ids: number[]
): Promise<Map<number, TcgImageResult>> {
  if (!ids.length) return new Map();
  const results = await Promise.all(
    chunk(ids, CHUNK).map((batch) =>
      tcgFetch(`(${dexQ(batch)}) ${PROMO_SV_CLAUSE}`)
    )
  );
  const cards = results.flat().filter(c => !SVP_BLACKLIST.has(c.id));
  return buildBestMap(cards, PROMO_RARITIES, false, false, true);
}

// Pass 2.5: Older full-art promos (swshp, etc.)
export async function fetchTcgPromoOlder(
  ids: number[]
): Promise<Map<number, TcgImageResult>> {
  if (!ids.length || !PROMO_OLDER_CLAUSE) return new Map();
  const results = await Promise.all(
    chunk(ids, CHUNK).map((batch) =>
      tcgFetch(`(${dexQ(batch)}) ${PROMO_OLDER_CLAUSE}`)
    )
  );
  return buildBestMap(results.flat(), PROMO_RARITIES, false, false, true);
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

// ── Alternative form card lookup ─────────────────────────────────────────────

// Game type → TCG energy type (only types with a distinct TCG energy)
const GAME_TO_TCG_ENERGY: Record<string, string> = {
  dragon: "Dragon", steel: "Metal", dark: "Darkness",
  fairy: "Fairy", psychic: "Psychic", fighting: "Fighting",
  fire: "Fire", water: "Water", grass: "Grass",
  electric: "Lightning", ice: "Water",
};

// A card is "English-legal" if it appears in at least one English format's legality list.
// Japanese-only promos are not in any English format and will have no Legal entry.
function isEnglishLegal(card: TcgCard): boolean {
  const l = card.legalities;
  if (!l) return false;
  return l.unlimited === "Legal" || l.expanded === "Legal" || l.standard === "Legal";
}

// Extract just the base Pokémon name from a mega displayName
// "Mega Charizard X" → "Charizard", "Mega Kangaskhan" → "Kangaskhan"
function megaBaseName(displayName: string): string {
  return displayName.replace(/^Mega /, "").replace(/ [XY]$/, "").trim();
}

export async function fetchFormCard(
  category: "mega" | "regional" | "gmax" | "other",
  dexId: number,
  displayName: string,
  formTypes: string[] = [],
  raritySet: Set<string> = VGX_RARITIES,
): Promise<string | null> {
  if (category === "gmax" || category === "other") return null;
  try {
    let cards: TcgCard[] = [];
    if (category === "mega") {
      const baseName = megaBaseName(displayName);
      const isXY = displayName.endsWith(" X") || displayName.endsWith(" Y");
      if (isXY) {
        // X/Y forms: only search exact display name to avoid cross-contamination
        // ("Mega Charizard X ex" must not match "Mega Charizard Y ex" cards and vice versa)
        cards = await tcgFetch(`name:"${displayName} ex" supertype:Pokémon`);
      } else {
        const [displayEx, mEx, megaEx, megaPlain] = await Promise.all([
          tcgFetch(`name:"${displayName} ex" supertype:Pokémon`),
          tcgFetch(`name:"M ${baseName}-EX" supertype:Pokémon`),
          tcgFetch(`name:"Mega ${baseName} ex" supertype:Pokémon`),
          tcgFetch(`name:"Mega ${baseName}" supertype:Pokémon`),
        ]);
        cards = [...displayEx, ...mEx, ...megaEx, ...megaPlain];
        // Dex-number fallback for any remaining Mega subtype card
        if (!cards.some(isEnglishLegal)) {
          const more = await tcgFetch(`nationalPokedexNumbers:${dexId} (subtypes:MEGA OR subtypes:Mega) supertype:Pokémon`);
          cards = [...cards, ...more];
        }
      }
    } else if (category === "regional") {
      cards = await tcgFetch(`name:"${displayName}" supertype:Pokémon`);
    }
    const valid = cards.filter(c =>
      (c.images?.large || c.images?.small) &&
      c.rarity &&
      raritySet.has(c.rarity) &&
      isEnglishLegal(c) &&
      !(c.subtypes ?? []).includes("Tera") &&
      !(c.rules ?? []).some((r) => TERA_RULE_RE.test(r))
    );
    if (!valid.length) return null;
    valid.sort((a, b) => {
      const rs = rarityScore(a.rarity) - rarityScore(b.rarity);
      if (rs !== 0) return rs;
      return (b.set?.releaseDate ?? "").localeCompare(a.set?.releaseDate ?? "");
    });
    return valid[0]?.images?.large ?? valid[0]?.images?.small ?? null;
  } catch { return null; }
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
