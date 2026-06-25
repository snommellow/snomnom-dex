const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── TCG card images (pokemontcg.io) ──────────────────────────────────────────

const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
const JUNK_RARITIES = new Set(["Common", "Uncommon", "Promo"]);

const PRIORITY_SETS = ["sv3pt5"];

const SV_SETS = [
  "sv1", "sv2", "sv3", "sv3pt5", "sv4", "sv4pt5",
  "sv5", "sv6", "sv6pt5", "sv7", "sv8", "sv8pt5",
  "sv9", "sv9pt5",
];

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

const EXCLUDED_SUBTYPES = new Set(["MEGA", "Mega", "VMAX", "VSTAR", "V-UNION"]);
const GIMMICK_RE = /\b(MEGA|VMAX|VSTAR|V-UNION)\b/i;

function isGimmick(card: TcgCard): boolean {
  return (card.subtypes ?? []).some((s) => EXCLUDED_SUBTYPES.has(s)) || GIMMICK_RE.test(card.name);
}

function rarityScore(rarity: string): number {
  const order = ["Special Illustration Rare", "Illustration Rare", "Ultra Rare", "Secret Rare", "Rare Holo", "Rare"];
  const idx = order.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

export interface TcgImageResult { tcgUrl: string | null }

function buildBestMap(cards: TcgCard[]): Map<number, TcgImageResult> {
  const best = new Map<number, { score: number; prioritySet: boolean; date: string; tcgUrl: string | null }>();

  for (const card of cards) {
    if (isGimmick(card)) continue;
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
        `&select=id,name,number,images,nationalPokedexNumbers,rarity,set,subtypes`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    return ((await res.json()).data as TcgCard[]) ?? [];
  } catch { return []; }
}

const IR_CLAUSE  = `(rarity:"Special Illustration Rare" OR rarity:"Illustration Rare")`;
const SUB_EXCL   = `-subtypes:mega -subtypes:vmax -subtypes:vstar`;
const CHUNK = 75;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<TcgImageResult[]> {
  const entries = pokemon.map((p) => ({
    ...p,
    displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1),
  }));

  const bestMap = new Map<number, TcgImageResult>();
  const merge = (m: Map<number, TcgImageResult>) =>
    m.forEach((v, id) => { if (!bestMap.has(id)) bestMap.set(id, v); });
  const missing = () => entries.filter((e) => !bestMap.has(e.id)).map((e) => e.displayName);

  // Pass 1: priority set (151) only
  const nameQ1 = entries.map((e) => `name:"${e.displayName}"`).join(" OR ");
  merge(buildBestMap(await tcgFetch(`(${nameQ1}) set.id:sv3pt5 ${IR_CLAUSE} ${SUB_EXCL}`)));

  // Pass 2: all SV sets for anything still missing
  const miss = missing();
  if (miss.length) {
    const setQ = SV_SETS.map((s) => `set.id:${s}`).join(" OR ");
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
