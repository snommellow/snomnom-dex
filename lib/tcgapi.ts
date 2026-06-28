// pokemontcg.io API — English TCG card lookup (https://pokemontcg.io)

import { buildChainSets } from "./chains";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

// Unified rarity priority — lower index = better card
const RARITY_ORDER = [
  // IR/SIR pass
  "Special Illustration Rare",
  "Illustration Rare",
  // VGX pass (lower index = higher priority)
  "Hyper Rare",
  "Rare Secret",
  "Trainer Gallery Rare Holo",
  "Ultra Rare",
  "Rare Ultra",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo V",
  "Rare Holo GX",
  "Rare Holo EX",
];

export const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
export const VGX_RARITIES = new Set([
  "Hyper Rare",
  "Rare Secret",
  "Trainer Gallery Rare Holo",
  "Ultra Rare",
  "Rare Ultra",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo V",
  "Rare Holo GX",
  "Rare Holo EX",
]);

// Trainer Gallery card number pattern — TG01, TG08, TG19, etc.
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

function nameMatches(cardName: string, query: string): boolean {
  const cn = cardName.toLowerCase();
  const q  = query.toLowerCase();
  return cn === q || cn.startsWith(q + " ") || cn.startsWith(q + "-") || cn.includes("& " + q);
}

// Fetch ALL cards matching a query, handling pagination automatically.
// Instead of one request per Pokémon, callers fetch an entire rarity at once
// and look up by name client-side — far fewer total requests.
async function fetchAllPages(q: string): Promise<PtcgCard[]> {
  const results: PtcgCard[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,set,images`;
    let data: PtcgCard[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
        const res = await fetch(url, {
          headers: getHeaders(),
          next: { revalidate: 86400 },
        });
        if (res.status === 429 && attempt < 2) continue;
        if (!res.ok) return results;
        const json = await res.json();
        data = json.data ?? [];
        break;
      } catch { if (attempt === 2) return results; }
    }
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

// Build a name→cards index from a bulk rarity fetch.
// Keys are lowercased card names for fast lookup.
function buildNameIndex(cards: PtcgCard[]): Map<string, PtcgCard[]> {
  const index = new Map<string, PtcgCard[]>();
  for (const card of cards) {
    const key = card.name.toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push(card);
    else index.set(key, [card]);
  }
  return index;
}

// Look up candidates for a Pokémon from a pre-built name index.
// Matches exact name or "name <suffix>" (e.g. "Charizard ex", "Charizard V").
function lookupCandidates(
  index: Map<string, PtcgCard[]>,
  displayName: string,
  rarity: string,
  { allowTrainerOwned = false, allowGimmick = false, skipRegionalFilter = false, allowRegionalFallback = false }: {
    allowTrainerOwned?: boolean;
    allowGimmick?: boolean;
    skipRegionalFilter?: boolean;
    allowRegionalFallback?: boolean;
  } = {},
): RankedCard[] {
  const nameLower = displayName.toLowerCase();
  const matched: RankedCard[] = [];
  const regionalMatched: RankedCard[] = [];
  for (const [key, cards] of index) {
    const isRegionalKey = REGIONAL_RE.test(key);
    // For regional keys (e.g. "alolan persian-gx"), check if the base name is contained
    const keyMatches = isRegionalKey
      ? (key.includes(" " + nameLower + "-") || key.includes(" " + nameLower + " ") || key.endsWith(" " + nameLower))
      : nameMatches(key, nameLower);
    if (!keyMatches) continue;
    for (const c of cards) {
      if (
        c.images?.large &&
        (allowTrainerOwned || !TRAINER_OWNED_RE.test(c.name)) &&
        (allowGimmick      || !MAIN_GIMMICK_RE.test(c.name))
      ) {
        if (skipRegionalFilter || !isRegionalKey) matched.push({ ...c, _rarity: rarity });
        else if (allowRegionalFallback) regionalMatched.push({ ...c, _rarity: rarity });
      }
    }
  }
  // Use regional cards only if no non-regional candidates found
  return matched.length ? matched : regionalMatched;
}

function pickBest(cards: RankedCard[]): string | null {
  if (!cards.length) return null;
  const winner = cards.reduce((a, b) => {
    const ra = rarityScore(a._rarity), rb = rarityScore(b._rarity);
    if (ra !== rb) return ra < rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    // Same rarity + same set: prefer higher number (alt arts are secret-rare numbered)
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

// Fetch all cards of a given rarity (non-Tera) and return a name index.
async function fetchRarityIndex(rarity: string, allowTeraEx = false, excludeMeSets = false): Promise<Map<string, PtcgCard[]>> {
  const teraFilter = allowTeraEx ? "" : " -subtypes:Tera";
  const meFilter = excludeMeSets ? " -set.id:me*" : "";
  const cards = await fetchAllPages(`rarity:"${rarity}"${teraFilter}${meFilter}`);
  return buildNameIndex(cards);
}

interface FetchOptions {
  allowTrainerOwned?: boolean;
  allowGimmick?: boolean;
  skipRegionalFilter?: boolean;
  allowTeraEx?: boolean;
}

// Pass 1: IR / SIR — highest quality full-art illustration cards, chain-set preferred.
export async function fetchTcgIrSir(
  pokemon: Array<{ id: number; name: string }>,
  chainsByDex: Map<number, number[]> = new Map(),
): Promise<Map<number, TcgImageResult>> {
  // Two bulk fetches cover all 151+ Pokémon — one per rarity
  const rarities = RARITY_ORDER.filter(r => IR_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r)));

  const candidatesList = pokemon.map(({ name }) => {
    const displayName = toDisplayName(name);
    return rarities.flatMap((r, i) => lookupCandidates(indexes[i], displayName, r));
  });

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

// Pass 1.5: SV-era full-art promos (svp set), highest number = best quality.
export async function fetchTcgPromoSv(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  // One bulk fetch for the entire svp set
  const allSvp = await fetchAllPages(`set.id:svp -subtypes:Tera`);
  const index = buildNameIndex(allSvp);

  const entries = pokemon.map(({ id, name }) => {
    const displayName = toDisplayName(name);
    const svpCards = (index.get(displayName.toLowerCase()) ?? []).filter(c =>
      c.images?.large &&
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
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 2.1: Trainer-owned IR/SIR (e.g. "Giovanni's Dugtrio", "Erika's Clefable")
// Uses bulk IR/SIR index with a contains check to match "X's <Name>" card names.
export async function fetchTcgTrainerOwnedIrSir(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER.filter(r => IR_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r)));

  const entries = pokemon.map(({ id, name }) => {
    const displayName = toDisplayName(name);
    const nameLower = displayName.toLowerCase();
    const candidates: RankedCard[] = [];
    for (let i = 0; i < rarities.length; i++) {
      for (const [key, cards] of indexes[i]) {
        if (!TRAINER_OWNED_RE.test(key)) continue;
        if (!key.includes(nameLower)) continue;
        for (const c of cards) {
          if (c.images?.large && !REGIONAL_RE.test(c.name))
            candidates.push({ ...c, _rarity: rarities[i] });
        }
      }
    }
    const url = pickBest(candidates);
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 3: V / GX / EX fallback — chain-set preferred.
export async function fetchTcgVgx(
  pokemon: Array<{ id: number; name: string }>,
  chainsByDex: Map<number, number[]> = new Map(),
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER.filter(r => VGX_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r, false, true)));

  const candidatesList = pokemon.map(({ name }) => {
    const displayName = toDisplayName(name);
    return rarities.flatMap((r, i) =>
      lookupCandidates(indexes[i], displayName, r, { allowGimmick: true, allowRegionalFallback: true })
        .filter(c => !["Rare Ultra", "Rare Secret", "Hyper Rare"].includes(r) || !c.name.endsWith("-GX"))
    );
  });

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

// Chain reconciliation: find the best card for a Pokémon within allowed sets.
export async function fetchTcgFromChainSet(
  pokemon: Array<{ id: number; name: string }>,
  requiredSets: Map<number, Set<string>>,
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER;
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r, true)));

  const entries = pokemon.map(({ id, name }) => {
    const displayName = toDisplayName(name);
    const allowed = requiredSets.get(id);
    if (!allowed?.size) return null;
    const candidates = rarities.flatMap((r, i) =>
      lookupCandidates(indexes[i], displayName, r, { allowGimmick: true })
        .filter(c => allowed.has(c.set.id))
    );
    const url = pickBest(candidates);
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Alt-form card lookup — IR → TG (regional) → VGX, with Mega name fallbacks.
// Alt forms are looked up individually (low volume, varied names).
export async function fetchFormCard(
  category: "mega" | "regional" | "gmax" | "other",
  _dexId: number,
  displayName: string,
  _formTypes: string[] = [],
  raritySet: Set<string> = VGX_RARITIES,
): Promise<string | null> {
  if (category === "gmax" || category === "other") return null;

  const rarities = RARITY_ORDER.filter(r => raritySet.has(r));
  const teraFilter = " -subtypes:Tera";
  const megaTeraFilter = ""; // mega ex cards in SV are Tera — allow them

  if (category === "regional") {
    if (raritySet === IR_RARITIES) {
      const cards = await fetchAllPages(`name:"${displayName}"${teraFilter}`);
      const candidates = cards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, displayName))
        .map(c => ({ ...c, _rarity: c.rarity }));
      return pickBest(candidates);
    }
    // VGX pass: check Trainer Gallery cards first
    const allCards = await fetchAllPages(`name:"${displayName}"`);
    const tgCards = allCards.filter(c => c.images?.large && TG_RE.test(c.number) && nameMatches(c.name, displayName));
    if (tgCards.length) {
      const best = tgCards.reduce((a, b) =>
        parseInt(b.number.slice(2)) > parseInt(a.number.slice(2)) ? b : a
      );
      return cardImageUrl(best);
    }
    const candidates = allCards
      .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, displayName))
      .map(c => ({ ...c, _rarity: c.rarity }));
    return pickBest(candidates);
  }

  if (category === "mega") {
    const baseName = displayName.replace(/^Mega /, "").replace(/ [XY]$/, "").trim();
    const isXY = displayName.endsWith(" X") || displayName.endsWith(" Y");
    const namesToTry = isXY
      ? [`${displayName} ex`]
      : [`${displayName} ex`, `M ${baseName}-EX`, `Mega ${baseName} ex`, `Mega ${baseName}`];

    for (const queryName of namesToTry) {
      const cards = await fetchAllPages(`name:"${queryName}"${megaTeraFilter}`);
      const candidates = cards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, queryName))
        .map(c => ({ ...c, _rarity: c.rarity }));
      const url = pickBest(candidates);
      if (url) return url;
    }
    return null;
  }

  return null;
}
