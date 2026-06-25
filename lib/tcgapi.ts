const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── PokéOS textless card images ───────────────────────────────────────────────
const POKEOS_BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

// Maps pokemontcg.io set ID → PokéOS set number
// sv3pt5 textless cards are split across PokéOS sets 110 and 111
// pokeosUrl() tries 111 first; cards missing there fall through to 110 via bgCandidates
const POKEOS_SET_MAP: Record<string, number> = {
  "sv3pt5":    111, // Scarlet & Violet—151 (primary)
  "swsh12pt5":  97, // Crown Zenith (guessed — verify)
};

// Secondary PokéOS set for sv3pt5 — used as extra bgCandidate
const POKEOS_SET_ALT: Record<string, number> = {
  "sv3pt5": 110,
};

function pokeosUrl(setId: string, cardNumber: string): string | null {
  const pokeosSet = POKEOS_SET_MAP[setId];
  if (!pokeosSet) return null;
  return `${POKEOS_BASE}/${pokeosSet}/${cardNumber}.jpg`;
}

function pokeosAltUrl(setId: string, cardNumber: string): string | null {
  const pokeosSet = POKEOS_SET_ALT[setId];
  if (!pokeosSet) return null;
  return `${POKEOS_BASE}/${pokeosSet}/${cardNumber}.jpg`;
}

// ── PokéOS TCG Pocket star cards ──────────────────────────────────────────────
// Set 384, cards 227-250 — full-art Pocket star illustrations
const POKEOS_POCKET_BASE = `${POKEOS_BASE}/384`;

const POCKET_STAR_MAP: Record<number, number> = {
  1:   227, // Bulbasaur
  // 228 — Ivysaur card present but not AR quality
  127: 229, // Pinsir
  4:   230, // Charmander
  78:  231, // Rapidash
  7:   232, // Squirtle
  130: 233, // Gyarados
  131: 234, // Lapras
  101: 235, // Electrode
  65:  236, // Alakazam
  79:  237, // Slowpoke
  50:  238, // Diglett
  104: 239, // Cubone
  // 240 — Machop card present but not AR quality
  34:  241, // Nidoking
  42:  242, // Golbat
  110: 243, // Weezing
  149: 244, // Dragonite
  18:  245, // Pidgeot
  // 246 — Abra card present but not AR quality
  132: 247, // Ditto
  133: 248, // Eevee
  137: 249, // Porygon
  143: 250, // Snorlax
};

export function getPocketStarUrl(dexId: number): string | null {
  const n = POCKET_STAR_MAP[dexId];
  return n != null ? `${POKEOS_POCKET_BASE}/${n}.png` : null;
}

// ── Rarity tiers ─────────────────────────────────────────────────────────────

const PREMIUM_RARITIES = [
  "Special Illustration Rare",
  "Illustration Rare",
];

const ACCEPTABLE_RARITIES = [
  "Special Illustration Rare",
  "Illustration Rare",
];

const JUNK_RARITIES = new Set(["Common", "Uncommon", "Promo"]);

function rarityScore(rarity: string): number {
  const order = [
    "Special Illustration Rare",
    "Illustration Rare",
    "Ultra Rare",
    "Secret Rare",
    "Rare Holo",
    "Rare",
  ];
  const idx = order.indexOf(rarity);
  return idx === -1 ? order.length + 10 : idx;
}

// ── Sets to prioritise ────────────────────────────────────────────────────────

const PRIORITY_SETS = [
  "sv3pt5",     // Scarlet & Violet—151
  "swsh12pt5",  // Crown Zenith
];

// ── Gimmick detection ─────────────────────────────────────────────────────────

interface TcgCard {
  id: string;
  name: string;
  number: string;
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  set: { id: string; releaseDate: string };
  subtypes: string[];
}

const EXCLUDED_SUBTYPES = new Set([
  "MEGA", "Mega", "VMAX", "VSTAR", "V-UNION",
]);

const GIMMICK_NAME_RE = /\b(MEGA|VMAX|VSTAR|V-UNION)\b/i;

function isGimmickVariant(card: TcgCard): boolean {
  if ((card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s))) return true;
  if (GIMMICK_NAME_RE.test(card.name)) return true;
  return false;
}

function isJunkRarity(rarity: string): boolean {
  return JUNK_RARITIES.has(rarity) || rarity === "";
}

// ── Best-card map builder ─────────────────────────────────────────────────────

interface CardEntry { score: number; prioritySet: boolean; date: string; pokeosUrl: string | null; pokeosAltUrl: string | null; tcgUrl: string | null }

function buildBestMap(cards: TcgCard[]): Map<number, { pokeosUrl: string | null; pokeosAltUrl: string | null; tcgUrl: string | null }> {
  const best = new Map<number, CardEntry>();

  for (const card of cards) {
    if (isGimmickVariant(card)) continue;
    if (isJunkRarity(card.rarity ?? "")) continue;

    const pokeos = pokeosUrl(card.set?.id ?? "", card.number ?? "");
    const pokeosAlt = pokeosAltUrl(card.set?.id ?? "", card.number ?? "");
    const tcgImg = card.images?.large ?? card.images?.small ?? null;
    if (!pokeos && !pokeosAlt && !tcgImg) continue;

    const score = rarityScore(card.rarity ?? "");
    const prioritySet = PRIORITY_SETS.includes(card.set?.id ?? "");
    const date = card.set?.releaseDate ?? "0000-00-00";

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const current = best.get(dexNum);
      const isBetter =
        !current ||
        (!current.prioritySet && prioritySet) ||
        (current.prioritySet === prioritySet && score < current.score) ||
        (current.prioritySet === prioritySet && score === current.score && date > current.date);
      if (isBetter) best.set(dexNum, { score, prioritySet, date, pokeosUrl: pokeos, pokeosAltUrl: pokeosAlt, tcgUrl: tcgImg });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, { pokeosUrl: v.pokeosUrl, pokeosAltUrl: v.pokeosAltUrl, tcgUrl: v.tcgUrl }]));
}

// ── API helpers ───────────────────────────────────────────────────────────────

const SUBTYPE_EXCLUSION = "-subtypes:mega -subtypes:vmax -subtypes:vstar";

const PREMIUM_RARITY_CLAUSE  = PREMIUM_RARITIES.map((r)  => `rarity:"${r}"`).join(" OR ");
const ACCEPTABLE_RARITY_CLAUSE = ACCEPTABLE_RARITIES.map((r) => `rarity:"${r}"`).join(" OR ");

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,number,images,nationalPokedexNumbers,rarity,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data as TcgCard[]) ?? [];
  } catch {
    return [];
  }
}

// Pass 1 — priority sets (sv3pt5, swsh12pt5) + IR/SIR only
async function fetchPass1(names: string[]): Promise<TcgCard[]> {
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  const setQ  = PRIORITY_SETS.map((s) => `set.id:${s}`).join(" OR ");
  return tcgFetch(`(${nameQ}) (${setQ}) (${PREMIUM_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`);
}

// Pass 2 — any set that has a PokéOS mapping, IR/SIR only
async function fetchPass2(names: string[]): Promise<TcgCard[]> {
  if (!names.length) return [];
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  const setQ  = Object.keys(POKEOS_SET_MAP).map((s) => `set.id:${s}`).join(" OR ");
  return tcgFetch(`(${nameQ}) (${setQ}) (${ACCEPTABLE_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface TcgImageResult { pokeosUrl: string | null; pokeosAltUrl: string | null; tcgUrl: string | null }

/**
 * Returns PokéOS textless URL + pokemontcg.io fallback image for each Pokémon.
 * Card renders try pokeosUrl first; if it 404s, tcgUrl is the next candidate.
 * Priority: sv3pt5 IR/SIR → any-PokéOS-set IR/SIR → null.
 */
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<TcgImageResult[]> {
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));

  const bestMap = new Map<number, TcgImageResult>();
  const merge = (map: Map<number, { pokeosUrl: string | null; pokeosAltUrl: string | null; tcgUrl: string | null }>) =>
    map.forEach((v, id) => { if (!bestMap.has(id)) bestMap.set(id, v); });
  const missing = () =>
    entries.filter((e) => !bestMap.has(e.id)).map((e) => e.displayName);

  merge(buildBestMap(await fetchPass1(entries.map((e) => e.displayName))));

  const miss2 = missing();
  if (miss2.length) {
    const results = await Promise.all(chunk(miss2, CHUNK).map(fetchPass2));
    merge(buildBestMap(results.flat()));
  }

  return entries.map((e) => bestMap.get(e.id) ?? { pokeosUrl: null, pokeosAltUrl: null, tcgUrl: null });
}
