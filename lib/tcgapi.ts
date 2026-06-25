const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── PokéOS textless card images ───────────────────────────────────────────────
const POKEOS_BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

// SV-era PokéOS set IDs fall in this range
const POKEOS_PROBE_RANGE = Array.from({ length: 50 }, (_, i) => i + 95); // 95–144

// Runtime cache: TCG setId → PokéOS set numbers that had the probed card
const pokeosSetCache = new Map<string, number[]>();

async function discoverPokeosIds(tcgSetId: string, cardNumber: string): Promise<number[]> {
  if (pokeosSetCache.has(tcgSetId)) return pokeosSetCache.get(tcgSetId)!;

  const results = await Promise.all(
    POKEOS_PROBE_RANGE.map(async (setId) => {
      try {
        const r = await fetch(
          `${POKEOS_BASE}/${setId}/${cardNumber}.jpg`,
          { method: "HEAD", cache: "no-store" }
        );
        return r.ok ? setId : null;
      } catch { return null; }
    })
  );
  const found = results.filter((x): x is number => x !== null);
  pokeosSetCache.set(tcgSetId, found);
  return found;
}

function buildPokeosUrl(setId: number, cardNumber: string): string {
  return `${POKEOS_BASE}/${setId}/${cardNumber}.jpg`;
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
  "Ultra Rare",
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

async function buildBestMap(cards: TcgCard[]): Promise<Map<number, TcgImageResult>> {
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
      if (isBetter) best.set(dexNum, { score, prioritySet, date, tcgUrl: tcgImg, card });
    }
  }

  // Now probe PokéOS for each winner
  const entries = [...best.entries()];
  await Promise.all(
    entries.map(async ([dexNum, entry]) => {
      const { card } = entry;
      const setId = card.set?.id ?? "";
      if (!setId || !card.number) return;
      // This will use the cache if the setId was already probed
      await discoverPokeosIds(setId, card.number);
    })
  );

  const result = new Map<number, TcgImageResult>();
  for (const [dexNum, entry] of entries) {
    const { card } = entry;
    const setId = card.set?.id ?? "";
    const pokeosIds = pokeosSetCache.get(setId) ?? [];
    const pokeosUrls = pokeosIds.map((id) => buildPokeosUrl(id, card.number));
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

  merge(await buildBestMap(await fetchPass1(entries.map((e) => e.displayName))));

  const miss2 = missing();
  if (miss2.length) {
    const results = await Promise.all(chunk(miss2, CHUNK).map(fetchPass2));
    merge(await buildBestMap(results.flat()));
  }

  return entries.map((e) => bestMap.get(e.id) ?? { pokeosUrls: [], tcgUrl: null });
}
