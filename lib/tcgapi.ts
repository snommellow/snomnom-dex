const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── PokéOS textless card images ───────────────────────────────────────────────
const POKEOS_BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

// Maps TCG setId → PokéOS set numbers (ordered, try each in sequence)
// Only include sets we've verified to avoid wrong-card matches
const POKEOS_SET_MAP: Record<string, number[]> = {
  "sv3pt5": [111, 110], // Scarlet & Violet—151 (primary 111, some cards in 110)
};

function getPokeosUrls(tcgSetId: string, cardNumber: string): string[] {
  const setIds = POKEOS_SET_MAP[tcgSetId] ?? [];
  return setIds.map((id) => `${POKEOS_BASE}/${id}/${cardNumber}.jpg`);
}

// ── PokéOS TCG Pocket star cards ──────────────────────────────────────────────
// Each entry is one PokéOS Pocket set. cards: { dexId → card number in that set }
// To add a new Pocket pack: append a new { pokeosId, name, cards } entry below.
// Card images use .png and live at POKEOS_BASE/{pokeosId}/{cardNumber}.png

interface PocketSet {
  pokeosId: number;
  name: string;
  cards: Record<number, number>; // dexId → card number within this PokéOS set
}

const POCKET_SETS: PocketSet[] = [
  {
    pokeosId: 384,
    name: "Genetic Apex",
    cards: {
      1:   227, // Bulbasaur
      // 228 — Ivysaur, not AR quality
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
      // 240 — Machop, not AR quality
      34:  241, // Nidoking
      42:  242, // Golbat
      110: 243, // Weezing
      149: 244, // Dragonite
      18:  245, // Pidgeot
      // 246 — Abra, not AR quality
      132: 247, // Ditto
      133: 248, // Eevee
      137: 249, // Porygon
      143: 250, // Snorlax
    },
  },
  // Future Pocket packs — add entries here as PokéOS adds them:
  // { pokeosId: 385, name: "Mythical Island", cards: { 35: 1, ... } },
];

/** Returns all PokéOS Pocket star URLs for a given Pokémon across all known packs. */
export function getPocketStarUrls(dexId: number): string[] {
  const urls: string[] = [];
  for (const set of POCKET_SETS) {
    const n = set.cards[dexId];
    if (n != null) urls.push(`${POKEOS_BASE}/${set.pokeosId}/${n}.png`);
  }
  return urls;
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

// sv3pt5 = 151 set has the most Gen 1 IR/SIR cards
const PRIORITY_SETS = ["sv3pt5"];

// SV-era sets to search (expanded to cover all SV releases)
const SV_SETS = [
  "sv1", "sv2", "sv3", "sv3pt5", "sv4", "sv4pt5",
  "sv5", "sv6", "sv6pt5", "sv7", "sv8", "sv8pt5",
  "sv9", "sv9pt5",
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

// ── Best-card map builder (with dynamic PokéOS discovery) ─────────────────────

interface CardEntry {
  score: number;
  prioritySet: boolean;
  date: string;
  tcgUrl: string | null;
  card: TcgCard;
}

export interface TcgImageResult { pokeosUrls: string[]; tcgUrl: string | null }

function buildBestMap(cards: TcgCard[]): Map<number, TcgImageResult> {
  const best = new Map<number, CardEntry>();

  for (const card of cards) {
    if (isGimmickVariant(card)) continue;
    if (isJunkRarity(card.rarity ?? "")) continue;

    const tcgImg = card.images?.large ?? card.images?.small ?? null;
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
      // Only use tcgUrl for IR/SIR — other card images show card text as background
      const useTcgUrl = PREMIUM_RARITIES.includes(card.rarity) ? tcgImg : null;
      if (isBetter) best.set(dexNum, { score, prioritySet, date, tcgUrl: useTcgUrl, card });
    }
  }

  const result = new Map<number, TcgImageResult>();
  for (const [dexNum, entry] of best.entries()) {
    const { card } = entry;
    const pokeosUrls = getPokeosUrls(card.set?.id ?? "", card.number ?? "");
    result.set(dexNum, { pokeosUrls, tcgUrl: entry.tcgUrl });
  }

  return result;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const SUBTYPE_EXCLUSION = "-subtypes:mega -subtypes:vmax -subtypes:vstar";

const PREMIUM_RARITY_CLAUSE   = PREMIUM_RARITIES.map((r)   => `rarity:"${r}"`).join(" OR ");
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

// Pass 1 — priority sets (sv3pt5 = 151) + IR/SIR only
async function fetchPass1(names: string[]): Promise<TcgCard[]> {
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  const setQ  = PRIORITY_SETS.map((s) => `set.id:${s}`).join(" OR ");
  return tcgFetch(`(${nameQ}) (${setQ}) (${PREMIUM_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`);
}

// Pass 2 — any SV-era set, IR/SIR/UR
async function fetchPass2(names: string[]): Promise<TcgCard[]> {
  if (!names.length) return [];
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  const setQ  = SV_SETS.map((s) => `set.id:${s}`).join(" OR ");
  return tcgFetch(`(${nameQ}) (${setQ}) (${ACCEPTABLE_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Returns PokéOS textless URLs + pokemontcg.io fallback for each Pokémon.
 * Dynamically discovers PokéOS set IDs by probing S3 with the card number.
 * Priority: sv3pt5 IR/SIR → any SV IR/SIR/UR → null.
 */
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<TcgImageResult[]> {
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));

  const bestMap = new Map<number, TcgImageResult>();
  const merge = (map: Map<number, TcgImageResult>) =>
    map.forEach((v, id) => { if (!bestMap.has(id)) bestMap.set(id, v); });
  const missing = () =>
    entries.filter((e) => !bestMap.has(e.id)).map((e) => e.displayName);

  merge(buildBestMap(await fetchPass1(entries.map((e) => e.displayName))));

  const miss2 = missing();
  if (miss2.length) {
    const results = await Promise.all(chunk(miss2, CHUNK).map(fetchPass2));
    merge(buildBestMap(results.flat()));
  }

  return entries.map((e) => bestMap.get(e.id) ?? { pokeosUrls: [], tcgUrl: null });
}
