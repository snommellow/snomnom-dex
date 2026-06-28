// TCGdex API — English TCG card lookup (https://tcgdex.dev)

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// Unified rarity priority — lower index = better card
const RARITY_ORDER = [
  "Special illustration rare",
  "Illustration rare",
  "Hyper rare",       // Secret Rare equivalent
  "Ultra Rare",       // Full-art V, full-art GX trainer, etc.
  "Holo Rare VSTAR",
  "Holo Rare VMAX",
  "Holo Rare V",
];

export const IR_RARITIES = new Set(["Special illustration rare", "Illustration rare"]);
export const VGX_RARITIES = new Set([
  "Hyper rare", "Ultra Rare", "Holo Rare VSTAR", "Holo Rare VMAX", "Holo Rare V",
]);

// Trainer Gallery localId pattern — TG01, TG08, TG19, etc.
// TCGdex classifies these as "Rare" so we detect by localId instead.
const TG_RE = /^TG\d+$/;

const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;
// Handle both straight (') and curly (') apostrophes used by TCGdex
const TRAINER_OWNED_RE = /['']\s*s\s+/i;
// VMAX/VSTAR in card name = gimmick form; excluded from main slot, allowed for alt-forms
const MAIN_GIMMICK_RE = /\b(VMAX|VSTAR|V-UNION)\b/i;

// SVP promos that are non-full-art stamp reprints — excluded from promo pass
const SVP_BLACKLIST = new Set(["svp-11", "svp-24", "svp-167", "svp-168", "svp-169"]);

// Gen 1 evolution chains by dex ID — used for chain-set tiebreaking
// A "chain set" is one where every member of the chain has a candidate card.
const GEN1_CHAINS: number[][] = [
  [1,2,3],[4,5,6],[7,8,9],[10,11,12],[13,14,15],[16,17,18],
  [19,20],[21,22],[23,24],[25,26],[27,28],[29,30,31],[32,33,34],
  [35,36],[37,38],[39,40],[41,42],[43,44,45],[46,47],[48,49],
  [50,51],[52,53],[54,55],[56,57],[58,59],[60,61,62],[63,64,65],
  [66,67,68],[69,70,71],[72,73],[74,75,76],[77,78],[79,80],
  [81,82],[84,85],[86,87],[88,89],[90,91],[92,93,94],[96,97],
  [98,99],[100,101],[102,103],[104,105],[109,110],[111,112],
  [116,117],[118,119],[120,121],[129,130],[133,134,135,136],
  [138,139],[140,141],[147,148,149],
];

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface RankedCard extends TcgdexCard { _rarity: string }

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

function cardImageUrl(card: TcgdexCard): string {
  return `${card.image}/high.webp`;
}

function rarityScore(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

function setIdFromCardId(id: string): string {
  return id.split("-")[0] ?? "";
}

// TCGdex does substring name matching — "Paras" returns "Parasol Lady".
// Post-filter: only accept exact match or "<query> <suffix>" (e.g. "Charizard ex").
function nameMatches(cardName: string, query: string): boolean {
  const cn = cardName.toLowerCase();
  const q  = query.toLowerCase();
  return cn === q || cn.startsWith(q + " ");
}

// All SV-era cards with " ex" suffix are Tera Pokémon — exclude from main slot.
// Alt-form lookups (mega ex cards) pass allowTeraEx: true to skip this filter.
function isTeraEx(card: TcgdexCard): boolean {
  return /\sex$/i.test(card.name) && setIdFromCardId(card.id).startsWith("sv");
}

async function tcgFetch(name: string, rarity?: string): Promise<TcgdexCard[]> {
  try {
    const params = new URLSearchParams({ name });
    if (rarity) params.set("rarity", rarity);
    const res = await fetch(`${TCGDEX_BASE}/cards?${params}`, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const json = await res.json();
    return (Array.isArray(json) ? json : (json?.data ?? [])) as TcgdexCard[];
  } catch { return []; }
}

function pickBest(cards: RankedCard[]): string | null {
  if (!cards.length) return null;
  const winner = cards.reduce((a, b) => {
    const ra = rarityScore(a._rarity), rb = rarityScore(b._rarity);
    if (ra !== rb) return ra < rb ? a : b;
    return setIdFromCardId(b.id) > setIdFromCardId(a.id) ? b : a;
  });
  return cardImageUrl(winner);
}

// Pick best card, preferring cards from chain sets (sets where full evo line is present).
function pickBestWithChain(cards: RankedCard[], chainSets: Set<string> | null): string | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    const chainCards = cards.filter(c => chainSets.has(setIdFromCardId(c.id)));
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

// Fetch all matching candidates (without picking) for chain-aware selection.
async function fetchCandidates(
  displayName: string,
  rarities: string[],
  { allowTrainerOwned = false, allowGimmick = false, skipRegionalFilter = false, allowTeraEx = false }: FetchOptions = {},
): Promise<RankedCard[]> {
  const results = await Promise.all(rarities.map(r => tcgFetch(displayName, r)));
  return results.flatMap((list, i) =>
    list
      .filter(c =>
        c.image &&
        nameMatches(c.name, displayName) &&
        (allowTeraEx        || !isTeraEx(c)) &&
        (skipRegionalFilter || !REGIONAL_RE.test(c.name)) &&
        (allowTrainerOwned  || !TRAINER_OWNED_RE.test(c.name)) &&
        (allowGimmick       || !MAIN_GIMMICK_RE.test(c.name))
      )
      .map(c => ({ ...c, _rarity: rarities[i] }))
  );
}

async function fetchBestByRarities(
  displayName: string,
  rarities: string[],
  opts: FetchOptions = {},
): Promise<string | null> {
  return pickBest(await fetchCandidates(displayName, rarities, opts));
}

// Build chain sets: for each evolution chain, find set IDs present for ALL members.
function buildChainSets(
  candidatesByDex: Map<number, RankedCard[]>,
): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const chain of GEN1_CHAINS) {
    if (chain.length < 2) continue;
    // Collect set IDs per chain member
    const setsByMember = chain.map(id => {
      const cards = candidatesByDex.get(id) ?? [];
      return new Set(cards.map(c => setIdFromCardId(c.id)));
    });
    // Intersect: sets where every member has a card
    const commonSets = setsByMember.reduce((acc, s) => {
      for (const setId of acc) if (!s.has(setId)) acc.delete(setId);
      return acc;
    }, new Set(setsByMember[0]));
    if (!commonSets.size) continue;
    for (const id of chain) {
      const existing = result.get(id);
      if (existing) for (const s of commonSets) existing.add(s);
      else result.set(id, new Set(commonSets));
    }
  }
  return result;
}

// Pass 1: IR / SIR — highest quality full-art illustration cards, chain-set preferred
export async function fetchTcgIrSir(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  const rarities = ["Special illustration rare", "Illustration rare"];
  // Fetch all candidates first so we can do chain detection
  const candidatesList = await Promise.all(
    pokemon.map(({ name }) => fetchCandidates(toDisplayName(name), rarities))
  );
  const candidatesByDex = new Map(pokemon.map((p, i) => [p.id, candidatesList[i]]));
  const chainSets = buildChainSets(candidatesByDex);

  const entries = pokemon.map(({ id }, i) => {
    const url = pickBestWithChain(candidatesList[i], chainSets.get(id) ?? null);
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 1.5: SV-era full-art promos (svp set, rarity "None" on TCGdex)
// Pick highest localId per Pokémon — higher numbers = better promo quality.
export async function fetchTcgPromoSv(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const displayName = toDisplayName(name);
      const allCards = await tcgFetch(displayName);
      const svpCards = allCards.filter(c =>
        c.image &&
        setIdFromCardId(c.id) === "svp" &&
        !SVP_BLACKLIST.has(c.id) &&
        nameMatches(c.name, displayName) &&
        !isTeraEx(c) &&
        !REGIONAL_RE.test(c.name) &&
        !TRAINER_OWNED_RE.test(c.name)
      );
      if (!svpCards.length) return null;
      const best = svpCards.reduce((a, b) =>
        parseInt(b.localId) > parseInt(a.localId) ? b : a
      );
      return [id, { tcgUrl: cardImageUrl(best) }] as const;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 2.1: Trainer-owned IR/SIR (e.g. "Erika's Clefable")
// Note: TCGdex name search returns exact/prefix matches only, so "Clefable"
// won't find "Erika's Clefable". This pass handles cases where the trainer
// name is included in the query (future: trainer-name mapping).
export async function fetchTcgTrainerOwnedIrSir(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const url = await fetchBestByRarities(
        toDisplayName(name),
        ["Special illustration rare", "Illustration rare"],
        { allowTrainerOwned: true },
      );
      return url ? [id, { tcgUrl: url }] as const : null;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 3: V / GX / EX fallback for Pokémon missing all earlier passes
export async function fetchTcgVgx(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER.filter(r => VGX_RARITIES.has(r));
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const url = await fetchBestByRarities(
        toDisplayName(name),
        rarities,
        { allowGimmick: true },
      );
      return url ? [id, { tcgUrl: url }] as const : null;
    })
  );
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
  const opts: FetchOptions = { skipRegionalFilter: true, allowGimmick: true, allowTeraEx: true };

  if (category === "regional") {
    if (raritySet === IR_RARITIES) {
      return fetchBestByRarities(displayName, rarities, opts);
    }
    // VGX pass: check Trainer Gallery cards first — they rank above Ultra Rare
    const allCards = await tcgFetch(displayName);
    const tgCards = allCards.filter(c =>
      c.image && TG_RE.test(c.localId) && nameMatches(c.name, displayName)
    );
    if (tgCards.length) {
      const best = tgCards.reduce((a, b) =>
        parseInt(b.localId.slice(2)) > parseInt(a.localId.slice(2)) ? b : a
      );
      return cardImageUrl(best);
    }
    return fetchBestByRarities(displayName, rarities, opts);
  }

  if (category === "mega") {
    const baseName = displayName.replace(/^Mega /, "").replace(/ [XY]$/, "").trim();
    const isXY = displayName.endsWith(" X") || displayName.endsWith(" Y");
    const namesToTry = isXY
      ? [`${displayName} ex`]
      : [`${displayName} ex`, `M ${baseName}-EX`, `Mega ${baseName} ex`, `Mega ${baseName}`];

    for (const queryName of namesToTry) {
      const url = await fetchBestByRarities(queryName, rarities, { ...opts, skipRegionalFilter: false });
      if (url) return url;
    }
    return null;
  }

  return null;
}
