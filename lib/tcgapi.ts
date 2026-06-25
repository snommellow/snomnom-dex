const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── PokéOS textless card images ───────────────────────────────────────────────
const POKEOS_BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

// Maps pokemontcg.io set ID → PokéOS set number
const POKEOS_SET_MAP: Record<string, number> = {
  "sv3pt5":   111, // Scarlet & Violet—151
  "swsh12pt5": 97, // Crown Zenith (guessed — verify)
};

function pokeosUrl(setId: string, cardNumber: string): string | null {
  const pokeosSet = POKEOS_SET_MAP[setId];
  if (!pokeosSet) return null;
  return `${POKEOS_BASE}/${pokeosSet}/${cardNumber}.jpg`;
}

// ── PokéOS TCG Pocket star cards ──────────────────────────────────────────────
// Set 384, cards 227-250 — full-art Pocket star illustrations
const POKEOS_POCKET_BASE = `${POKEOS_BASE}/384`;

const POCKET_STAR_MAP: Record<number, number> = {
  1:   227, // Bulbasaur
  44:  228, // Gloom
  112: 229, // Rhydon
  4:   230, // Charmander
  59:  231, // Arcanine
  134: 232, // Vaporeon
  130: 233, // Gyarados
  131: 234, // Lapras
  101: 235, // Electrode
  6:   236, // Charizard
  79:  237, // Slowpoke
  50:  238, // Diglett
  104: 239, // Cubone
  31:  240, // Nidoqueen
  40:  241, // Wigglytuff
  42:  242, // Golbat
  // 243 — unidentified
  149: 244, // Dragonite
  9:   245, // Blastoise
  52:  246, // Meowth
  132: 247, // Ditto
  133: 248, // Eevee
  121: 249, // Starmie
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

function buildBestMap(cards: TcgCard[]): Map<number, string> {
  const best = new Map<number, { score: number; prioritySet: boolean; date: string; url: string }>();

  for (const card of cards) {
    if (isGimmickVariant(card)) continue;
    if (isJunkRarity(card.rarity ?? "")) continue;

    // Prefer PokéOS textless URL; fall back to nothing (caller handles fallback)
    const url = pokeosUrl(card.set?.id ?? "", card.number ?? "");
    if (!url) continue;

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
      if (isBetter) best.set(dexNum, { score, prioritySet, date, url });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, v.url]));
}

// ── API helpers ───────────────────────────────────────────────────────────────

const SUBTYPE_EXCLUSION = "-subtypes:mega -subtypes:vmax -subtypes:vstar";

const PREMIUM_RARITY_CLAUSE  = PREMIUM_RARITIES.map((r)  => `rarity:"${r}"`).join(" OR ");
const ACCEPTABLE_RARITY_CLAUSE = ACCEPTABLE_RARITIES.map((r) => `rarity:"${r}"`).join(" OR ");

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,number,nationalPokedexNumbers,rarity,set,subtypes`,
      { cache: "no-store" }
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

/**
 * Fetch the best PokéOS textless card URL for each Pokémon via pokemontcg.io metadata.
 * Priority: sv3pt5 IR/SIR → swsh12pt5 IR/SIR → null (falls back to Pocket/official art).
 */
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<(string | null)[]> {
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));

  const bestMap = new Map<number, string>();
  const merge = (map: Map<number, string>) =>
    map.forEach((url, id) => { if (!bestMap.has(id)) bestMap.set(id, url); });
  const missing = () =>
    entries.filter((e) => !bestMap.has(e.id)).map((e) => e.displayName);

  merge(buildBestMap(await fetchPass1(entries.map((e) => e.displayName))));

  const miss2 = missing();
  if (miss2.length) {
    const results = await Promise.all(chunk(miss2, CHUNK).map(fetchPass2));
    merge(buildBestMap(results.flat()));
  }

  return entries.map((e) => bestMap.get(e.id) ?? null);
}
