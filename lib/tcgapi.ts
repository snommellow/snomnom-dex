// pokemontcg.io API — English TCG card lookup (https://pokemontcg.io)

import { buildChainSets } from "./chains";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

// Limit concurrent requests to avoid rate limiting.
const MAX_CONCURRENT = 10;
let _active = 0;
const _queue: Array<() => void> = [];
function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _active++;
      fn().then(resolve, reject).finally(() => {
        _active--;
        if (_queue.length > 0) _queue.shift()!();
      });
    };
    if (_active < MAX_CONCURRENT) run();
    else _queue.push(run);
  });
}

// Unified rarity priority — lower index = better card
const RARITY_ORDER = [
  "Special Illustration Rare",
  "Illustration Rare",
  "Hyper Rare",
  "Ultra Rare",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo V",
];

export const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
export const VGX_RARITIES = new Set([
  "Hyper Rare", "Ultra Rare", "Rare Holo VSTAR", "Rare Holo VMAX", "Rare Holo V",
]);

// Trainer Gallery localId pattern — TG01, TG08, TG19, etc.
const TG_RE = /^TG\d+$/;

const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;
const TRAINER_OWNED_RE = /['']\s*s\s+/i;
const MAIN_GIMMICK_RE = /\b(VMAX|VSTAR|V-UNION)\b/i;

// SVP promos that are non-full-art stamp reprints — excluded from promo pass
const SVP_BLACKLIST = new Set(["11", "24", "167", "168", "169"]);

interface PtcgCard {
  id: string;
  number: string;
  name: string;
  rarity: string;
  subtypes: string[];
  set: { id: string };
  images: { small: string; large: string };
}

interface RankedCard extends PtcgCard { _rarity: string }

export interface TcgImageResult { tcgUrl: string | null }

const NAME_OVERRIDES: Record<string, string> = {
  "nidoran-f": "Nidoran ♀",
  "nidoran-m": "Nidoran ♂",
  "mr-mime":   "Mr. Mime",
  "farfetchd": "Farfetch'd",
  "ho-oh":     "Ho-Oh",
};

function toDisplayName(slug: string): string {
  return NAME_OVERRIDES[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

function cardImageUrl(card: PtcgCard): string {
  return card.images.large;
}

function rarityScore(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

// TCGdex does substring name matching — "Paras" returns "Parasol Lady".
// Post-filter: only accept exact match or "<query> <suffix>" (e.g. "Charizard ex").
function nameMatches(cardName: string, query: string): boolean {
  const cn = cardName.toLowerCase();
  const q  = query.toLowerCase();
  return cn === q || cn.startsWith(q + " ");
}

// Fetch all cards for a given name from pokemontcg.io.
// extraQ: additional Lucene query terms, e.g. " -subtypes:Tera"
async function ptcgFetch(name: string, extraQ = ""): Promise<PtcgCard[]> {
  const q = `name:"${name}"${extraQ}`;
  const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&select=id,number,name,rarity,subtypes,set,images`;
  return withRateLimit(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
        const res = await fetch(url, {
          headers: getHeaders(),
          next: { revalidate: 86400 },
        });
        if (res.status === 429 && attempt < 2) continue;
        if (!res.ok) return [];
        const json = await res.json();
        return (json.data ?? []) as PtcgCard[];
      } catch { if (attempt === 2) return []; }
    }
    return [];
  });
}

function pickBest(cards: RankedCard[]): string | null {
  if (!cards.length) return null;
  const winner = cards.reduce((a, b) => {
    const ra = rarityScore(a._rarity), rb = rarityScore(b._rarity);
    if (ra !== rb) return ra < rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    // Same rarity + same set: prefer higher number (alt arts have higher secret-rare numbers)
    const aNum = parseInt(a.number) || 0, bNum = parseInt(b.number) || 0;
    return bNum >= aNum ? b : a;
  });
  return cardImageUrl(winner);
}

function pickBestWithChain(cards: RankedCard[], chainSets: Set<string> | undefined): string | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    const chainCards = cards.filter(c => chainSets.has(c.set.id));
    if (chainCards.length) return pickBest(chainCards);
  }
  return pickBest(cards);
}

interface FetchOptions {
  allowTrainerOwned?: boolean;
  allowGimmick?: boolean;
  skipRegionalFilter?: boolean;
  allowTeraEx?: boolean;
}

async function fetchCandidates(
  displayName: string,
  rarities: string[],
  { allowTrainerOwned = false, allowGimmick = false, skipRegionalFilter = false, allowTeraEx = false }: FetchOptions = {},
): Promise<RankedCard[]> {
  // Fetch all cards for this name in one request; filter by rarity client-side.
  // -subtypes:Tera excludes Tera ex cards server-side unless allowTeraEx is set.
  const teraFilter = allowTeraEx ? "" : " -subtypes:Tera";
  const allCards = await ptcgFetch(displayName, teraFilter);
  const raritySet = new Set(rarities);
  return allCards
    .filter(c =>
      c.images?.large &&
      raritySet.has(c.rarity) &&
      nameMatches(c.name, displayName) &&
      (skipRegionalFilter || !REGIONAL_RE.test(c.name)) &&
      (allowTrainerOwned  || !TRAINER_OWNED_RE.test(c.name)) &&
      (allowGimmick       || !MAIN_GIMMICK_RE.test(c.name))
    )
    .map(c => ({ ...c, _rarity: c.rarity }));
}

async function fetchBestByRarities(
  displayName: string,
  rarities: string[],
  opts: FetchOptions = {},
): Promise<string | null> {
  return pickBest(await fetchCandidates(displayName, rarities, opts));
}

// Pass 1: IR / SIR — highest quality full-art illustration cards.
export async function fetchTcgIrSir(
  pokemon: Array<{ id: number; name: string }>,
  chainsByDex: Map<number, number[]> = new Map(),
): Promise<Map<number, TcgImageResult>> {
  const rarities = RARITY_ORDER.filter(r => IR_RARITIES.has(r));
  const candidatesList = await Promise.all(
    pokemon.map(({ name }) => fetchCandidates(toDisplayName(name), rarities))
  );
  const setsByDex = new Map(
    pokemon.map((p, i) => [p.id, new Set(candidatesList[i].map(c => c.set.id))])
  );
  const chainSetsMap = buildChainSets(setsByDex, chainsByDex);

  const entries = pokemon.map(({ id }, i) => {
    const url = pickBestWithChain(candidatesList[i], chainSetsMap.get(id));
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 1.5: SV-era full-art promos (svp set, rarity "None" on TCGdex)
// pokemontcg.io: filter by set.id === "svp", pick highest card number.
export async function fetchTcgPromoSv(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const displayName = toDisplayName(name);
      const allCards = await ptcgFetch(displayName, " -subtypes:Tera");
      const svpCards = allCards.filter(c =>
        c.images?.large &&
        c.set.id === "svp" &&
        !SVP_BLACKLIST.has(c.number) &&
        nameMatches(c.name, displayName) &&
        !REGIONAL_RE.test(c.name) &&
        !TRAINER_OWNED_RE.test(c.name)
      );
      if (!svpCards.length) return null;
      const best = svpCards.reduce((a, b) =>
        parseInt(b.number) > parseInt(a.number) ? b : a
      );
      return [id, { tcgUrl: cardImageUrl(best) }] as const;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 2.1: Trainer-owned IR/SIR (e.g. "Erika's Clefable")
export async function fetchTcgTrainerOwnedIrSir(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const url = await fetchBestByRarities(
        toDisplayName(name),
        RARITY_ORDER.filter(r => IR_RARITIES.has(r)),
        { allowTrainerOwned: true },
      );
      return url ? [id, { tcgUrl: url }] as const : null;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 3: V / GX / EX fallback — chain-set preferred.
export async function fetchTcgVgx(
  pokemon: Array<{ id: number; name: string }>,
  chainsByDex: Map<number, number[]> = new Map(),
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER.filter(r => VGX_RARITIES.has(r));
  const candidatesList = await Promise.all(
    pokemon.map(({ name }) => fetchCandidates(toDisplayName(name), rarities, { allowGimmick: true }))
  );
  const setsByDex = new Map(
    pokemon.map((p, i) => [p.id, new Set(candidatesList[i].map(c => c.set.id))])
  );
  const chainSetsMap = buildChainSets(setsByDex, chainsByDex);

  const entries = pokemon.map(({ id }, i) => {
    const url = pickBestWithChain(candidatesList[i], chainSetsMap.get(id));
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Chain reconciliation: find the best IR/SIR or VGX card for a Pokémon,
// but ONLY return it if the result is from one of the allowed set IDs.
export async function fetchTcgFromChainSet(
  pokemon: Array<{ id: number; name: string }>,
  requiredSets: Map<number, Set<string>>,
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const allRarities = RARITY_ORDER;
  const candidatesList = await Promise.all(
    pokemon.map(({ name }) =>
      fetchCandidates(toDisplayName(name), allRarities, { allowGimmick: true })
    )
  );
  const entries = pokemon.map(({ id }, i) => {
    const allowed = requiredSets.get(id);
    if (!allowed?.size) return null;
    const inSet = candidatesList[i].filter(c => allowed.has(c.set.id));
    const url = pickBest(inSet);
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Alt-form card lookup — IR → TG (regional) → VGX, with Mega name fallbacks
export async function fetchFormCard(
  category: "mega" | "regional" | "gmax" | "other",
  _dexId: number,
  displayName: string,
  _formTypes: string[] = [],
  raritySet: Set<string> = VGX_RARITIES,
): Promise<string | null> {
  if (category === "gmax" || category === "other") return null;

  const rarities = RARITY_ORDER.filter(r => raritySet.has(r));
  const regionalOpts: FetchOptions = { skipRegionalFilter: true, allowGimmick: false };
  // Mega ex cards in SV use " ex" suffix and ARE Tera — allow them for mega alt forms
  const megaOpts: FetchOptions = { allowGimmick: true, allowTeraEx: true };

  if (category === "regional") {
    if (raritySet === IR_RARITIES) {
      return fetchBestByRarities(displayName, rarities, regionalOpts);
    }
    // VGX pass: check Trainer Gallery cards first
    const allCards = await ptcgFetch(displayName);
    const tgCards = allCards.filter(c =>
      c.images?.large && TG_RE.test(c.number) && nameMatches(c.name, displayName)
    );
    if (tgCards.length) {
      const best = tgCards.reduce((a, b) =>
        parseInt(b.number.slice(2)) > parseInt(a.number.slice(2)) ? b : a
      );
      return cardImageUrl(best);
    }
    return fetchBestByRarities(displayName, rarities, regionalOpts);
  }

  if (category === "mega") {
    const baseName = displayName.replace(/^Mega /, "").replace(/ [XY]$/, "").trim();
    const isXY = displayName.endsWith(" X") || displayName.endsWith(" Y");
    const namesToTry = isXY
      ? [`${displayName} ex`]
      : [`${displayName} ex`, `M ${baseName}-EX`, `Mega ${baseName} ex`, `Mega ${baseName}`];

    for (const queryName of namesToTry) {
      const url = await fetchBestByRarities(queryName, rarities, megaOpts);
      if (url) return url;
    }
    return null;
  }

  return null;
}
