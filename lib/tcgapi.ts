const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── Rarity tiers ─────────────────────────────────────────────────────────────

const PREMIUM_RARITIES = [
  "Special Illustration Rare",
  "Illustration Rare",
];

// Only full-art illustration cards — anything with a text box is excluded
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

// ── Sets to prioritise for chain/scene art ────────────────────────────────────

const PRIORITY_SETS = [
  "sv3pt5",     // Scarlet & Violet—151 (Gen 1 chain art)
  "swsh12pt5",  // Crown Zenith
];

// ── Gimmick detection ─────────────────────────────────────────────────────────

interface TcgCard {
  id: string;
  name: string;
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  set: { id: string; releaseDate: string };
  subtypes: string[];
}

// Only exclude older power-creep mechanics. Modern lowercase "ex" (SV era)
// and GX cards can be IR/SIR full-art, so they're allowed.
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

function buildBestMap(cards: TcgCard[], rejectJunk = true): Map<number, string> {
  const best = new Map<number, { score: number; prioritySet: boolean; date: string; url: string }>();

  for (const card of cards) {
    if (isGimmickVariant(card)) continue;
    if (rejectJunk && isJunkRarity(card.rarity ?? "")) continue;

    const url = card.images?.large ?? card.images?.small;
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

const PREMIUM_RARITY_CLAUSE = PREMIUM_RARITIES.map((r) => `rarity:"${r}"`).join(" OR ");
const ACCEPTABLE_RARITY_CLAUSE = ACCEPTABLE_RARITIES.map((r) => `rarity:"${r}"`).join(" OR ");

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,images,nationalPokedexNumbers,rarity,set,subtypes`,
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

// Pass 2 — any set, IR/SIR only
async function fetchPass2(names: string[]): Promise<TcgCard[]> {
  if (!names.length) return [];
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  return tcgFetch(`(${nameQ}) (${ACCEPTABLE_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch the best TCG card image for each Pokémon.
 * Only IR and SIR full-art cards are used. Pokémon without one return null
 * and fall back to PokeAPI official artwork.
 *
 * Pass 1 — sv3pt5/swsh12pt5, IR/SIR  (Gen 1 priority art)
 * Pass 2 — any set, IR/SIR only
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
