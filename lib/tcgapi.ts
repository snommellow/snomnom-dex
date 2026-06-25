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

// Anything at or below this is "standard layout" — text box, common frame
const JUNK_RARITIES = new Set(["Common", "Uncommon", "Promo"]);

function rarityScore(rarity: string): number {
  const order = [
    "Special Illustration Rare",  // 0  — best
    "Illustration Rare",          // 1
    "Ultra Rare",                 // 2
    "Secret Rare",                // 3
    "Rare Holo",                  // 4
    "Rare",                       // 5
  ];
  const idx = order.indexOf(rarity);
  return idx === -1 ? order.length + 10 : idx;  // junk gets a very high score
}

// ── Sets to prioritise for chain/scene art ────────────────────────────────────

const PRIORITY_SETS = [
  "sv3pt5",     // Scarlet & Violet—151 (Gen 1 chain art)
  "swsh12pt5",  // Crown Zenith
];

// ── Gimmick detection (subtype + name) ───────────────────────────────────────

interface TcgCard {
  id: string;
  name: string;
  images: { small: string; large: string };
  nationalPokedexNumbers: number[];
  rarity: string;
  set: { id: string; releaseDate: string };
  subtypes: string[];
}

const EXCLUDED_SUBTYPES = new Set([
  "MEGA", "Mega", "V", "VMAX", "VSTAR", "EX", "GX", "V-UNION",
]);

// Match "Charizard VMAX", "Pikachu V", "Blastoise-GX", etc.
const GIMMICK_NAME_RE = /\b(MEGA|VMAX|VSTAR|V-UNION|GX|EX)\b|[-\s]V$/i;

function isGimmickVariant(card: TcgCard): boolean {
  if ((card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s))) return true;
  if (GIMMICK_NAME_RE.test(card.name)) return true;
  return false;
}

function isJunkRarity(rarity: string): boolean {
  return JUNK_RARITIES.has(rarity) || rarity === "";
}

// ── Best-card map builder ─────────────────────────────────────────────────────

function buildBestMap(
  cards: TcgCard[],
  rejectJunk = true
): Map<number, string> {
  const best = new Map<
    number,
    { score: number; prioritySet: boolean; date: string; url: string }
  >();

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

      // Priority order: priority set > rarity score > newest date
      const isBetter =
        !current ||
        (!current.prioritySet && prioritySet) ||
        (current.prioritySet === prioritySet && score < current.score) ||
        (current.prioritySet === prioritySet &&
          score === current.score &&
          date > current.date);

      if (isBetter) best.set(dexNum, { score, prioritySet, date, url });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, v.url]));
}

// ── API helpers ───────────────────────────────────────────────────────────────

const SUBTYPE_EXCLUSION =
  "-subtypes:mega -subtypes:vmax -subtypes:vstar -subtypes:v -subtypes:ex -subtypes:gx";

const PREMIUM_RARITY_CLAUSE = PREMIUM_RARITIES
  .map((r) => `rarity:"${r}"`)
  .join(" OR ");

const ACCEPTABLE_RARITY_CLAUSE = ACCEPTABLE_RARITIES
  .map((r) => `rarity:"${r}"`)
  .join(" OR ");

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

// Pass 1 — priority sets + premium rarity only (IR / SIR)
async function fetchPass1(names: string[]): Promise<TcgCard[]> {
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  const setQ  = PRIORITY_SETS.map((s) => `set.id:${s}`).join(" OR ");
  return tcgFetch(
    `(${nameQ}) (${setQ}) (${PREMIUM_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`
  );
}

// Pass 2 — any set, IR/SIR only (full-art, no text box)
async function fetchPass2(names: string[]): Promise<TcgCard[]> {
  if (!names.length) return [];
  const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
  return tcgFetch(
    `(${nameQ}) (${ACCEPTABLE_RARITY_CLAUSE}) ${SUBTYPE_EXCLUSION}`
  );
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
 * Only Illustration Rare and Special Illustration Rare cards are accepted
 * (full-art, no text box). Pokémon without IR/SIR return null and fall back
 * to PokeAPI official artwork on the card.
 *
 * Pass 1 (1 req)  — sv3pt5 + swsh12pt5, IR/SIR  → priority chain/scene art
 * Pass 2 (≤2 req) — any set, IR/SIR only         → any full-art version
 *
 * Total requests: 1–3.
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

  // ── Pass 1: priority sets, premium rarities ──
  merge(buildBestMap(await fetchPass1(entries.map((e) => e.displayName))));

  // ── Pass 2: any set, IR/SIR only ──
  const miss2 = missing();
  if (miss2.length) {
    const results = await Promise.all(chunk(miss2, CHUNK).map(fetchPass2));
    merge(buildBestMap(results.flat()));
  }

  // Pokémon still missing have no IR/SIR card → return null → fall back to official artwork
  return entries.map((e) => bestMap.get(e.id) ?? null);
}
