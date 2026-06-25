const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

// ── Pocket star cards (PokéOS set 384) ───────────────────────────────────────
// dexId → card number within the PokéOS set. Add new packs as entries in POCKET_SETS.

const POKEOS_BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

interface PocketSet {
  pokeosId: number;
  name: string;
  cards: Record<number, number>; // dexId → card number
}

const POCKET_SETS: PocketSet[] = [
  {
    pokeosId: 384,
    name: "Genetic Apex",
    cards: {
      1:   227, // Bulbasaur
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
      34:  241, // Nidoking
      42:  242, // Golbat
      110: 243, // Weezing
      149: 244, // Dragonite
      18:  245, // Pidgeot
      132: 247, // Ditto
      133: 248, // Eevee
      137: 249, // Porygon
      143: 250, // Snorlax
    },
  },
  // Add new Pocket packs here as PokéOS adds them
];

export function getPocketStarUrls(dexId: number): string[] {
  return POCKET_SETS.flatMap((s) => {
    const n = s.cards[dexId];
    return n != null ? [`${POKEOS_BASE}/${s.pokeosId}/${n}.png`] : [];
  });
}

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
