const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── TCG card images (pokemontcg.io) ──────────────────────────────────────────

const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
const JUNK_RARITIES = new Set(["Common", "Uncommon", "Promo"]);

const PRIORITY_SETS = ["sv3pt5"];

// Fetched once per build — discovers all SV set IDs including new releases
let _svSetIds: string[] | null = null;

async function getSvSetIds(): Promise<string[]> {
  if (_svSetIds) return _svSetIds;
  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/sets?q=series:"Scarlet %26 Violet"&select=id&pageSize=100`,
      { next: { revalidate: 86400 } }
    );
    if (res.ok) {
      const data = await res.json();
      _svSetIds = (data.data as { id: string }[]).map((s) => s.id);
      return _svSetIds;
    }
  } catch { /* fall through to fallback */ }
  _svSetIds = [
    "sv1", "sv2", "sv3", "sv3pt5", "sv4", "sv4pt5",
    "sv5", "sv6", "sv6pt5", "sv7", "sv8", "sv8pt5",
    "sv9", "sv9pt5",
  ];
  return _svSetIds;
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

function isGimmick(card: TcgCard): boolean {
  if ((card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s))) return true;
  if (GIMMICK_RE.test(card.name)) return true;
  // Trainer cards have no dex numbers so they're filtered by buildBestMap already,
  // but exclude explicitly for safety
  if (card.supertype === "Trainer") return true;
  return false;
}

function rarityScore(rarity: string): number {
  const order = ["Special Illustration Rare", "Illustration Rare", "Ultra Rare", "Secret Rare", "Rare Holo", "Rare"];
  const idx = order.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

export interface TcgImageResult { tcgUrl: string | null }

// Trainer-owned cards have a possessive in the name e.g. "Lillie's Clefairy"
const TRAINER_OWNED_RE = /'\s*s\s+/i;

function buildBestMap(cards: TcgCard[]): Map<number, TcgImageResult> {
  const best = new Map<number, { score: number; prioritySet: boolean; date: string; tcgUrl: string | null }>();

  for (const card of cards) {
    if (isGimmick(card)) continue;
    if (TRAINER_OWNED_RE.test(card.name)) continue;
    if (JUNK_RARITIES.has(card.rarity ?? "") || !card.rarity) continue;
    if (!IR_RARITIES.has(card.rarity)) continue;

    const tcgUrl = card.images?.large ?? card.images?.small ?? null;
    const score = rarityScore(card.rarity);
    const prioritySet = PRIORITY_SETS.includes(card.set?.id ?? "");
    const date = card.set?.releaseDate ?? "0000-00-00";

    for (const dexNum of card.nationalPokedexNumbers ?? []) {
      const cur = best.get(dexNum);
      const better =
        !cur ||
        (!cur.prioritySet && prioritySet) ||
        (cur.prioritySet === prioritySet && score < cur.score) ||
        (cur.prioritySet === prioritySet && score === cur.score && date > cur.date);
      if (better) best.set(dexNum, { score, prioritySet, date, tcgUrl });
    }
  }

  return new Map([...best.entries()].map(([k, v]) => [k, { tcgUrl: v.tcgUrl }]));
}

async function tcgFetch(q: string): Promise<TcgCard[]> {
  try {
    const res = await fetch(
      `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=250&orderBy=-set.releaseDate` +
        `&select=id,name,number,images,nationalPokedexNumbers,rarity,supertype,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    return ((await res.json()).data as TcgCard[]) ?? [];
  } catch { return []; }
}

const IR_CLAUSE  = `(rarity:"Special Illustration Rare" OR rarity:"Illustration Rare")`;
const SUB_EXCL   = `-subtypes:mega -subtypes:vmax -subtypes:vstar -subtypes:tera -supertype:Trainer`;
const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// PokéAPI slugs → pokemontcg.io display names
const NAME_OVERRIDES: Record<string, string> = {
  "nidoran-f":  "Nidoran ♀",
  "nidoran-m":  "Nidoran ♂",
  "mr-mime":    "Mr. Mime",
  "farfetchd":  "Farfetch'd",
  "ho-oh":      "Ho-Oh",
};

function toDisplayName(slug: string): string {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<TcgImageResult[]> {
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: toDisplayName(p.name),
  }));

  const bestMap = new Map<number, TcgImageResult>();
  const merge = (m: Map<number, TcgImageResult>) =>
    m.forEach((v, id) => { if (!bestMap.has(id)) bestMap.set(id, v); });
  const missing = () => entries.filter((e) => !bestMap.has(e.id)).map((e) => e.displayName);

  // Pass 1: priority set (151) only, chunked same as pass 2
  const p1chunks = await Promise.all(
    chunk(entries.map((e) => e.displayName), CHUNK).map((names) => {
      const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
      return tcgFetch(`(${nameQ}) set.id:sv3pt5 ${IR_CLAUSE} ${SUB_EXCL}`);
    })
  );
  merge(buildBestMap(p1chunks.flat()));

  // Pass 2: all SV sets (discovered dynamically) for anything still missing
  const miss = missing();
  if (miss.length) {
    const svIds = await getSvSetIds();
    const setQ = svIds.map((s) => `set.id:${s}`).join(" OR ");
    const chunks = await Promise.all(
      chunk(miss, CHUNK).map((names) => {
        const nameQ = names.map((n) => `name:"${n}"`).join(" OR ");
        return tcgFetch(`(${nameQ}) (${setQ}) ${IR_CLAUSE} ${SUB_EXCL}`);
      })
    );
    merge(buildBestMap(chunks.flat()));
  }

  return entries.map((e) => bestMap.get(e.id) ?? { tcgUrl: null });
}
