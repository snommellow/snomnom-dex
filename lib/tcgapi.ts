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
  "Rare Holo V",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
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
  "Rare Holo V",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo GX",
  "Rare Holo EX",
]);

// Trainer Gallery card number pattern — TG01, TG08, TG19, etc.
const TG_RE = /^TG\d+$/;

const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;
const TRAINER_OWNED_RE = /['']\s*s\s+/i;
const MAIN_GIMMICK_RE = /\b(VMAX|VSTAR|V-UNION)\b/i;

// SVP promos that are non-full-art stamp reprints — excluded from promo pass
const SVP_BLACKLIST = new Set(["11", "24", "122", "167", "168", "169"]);

// Early SWSH sets (Shining Fates and below) — Rare Ultra V cards from these are not alt arts
const SWSH_EARLY_SETS = new Set(["swsh1", "swsh2", "swsh3", "swsh35", "swsh4", "swsh45"]);

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

export interface TcgImageResult { tcgUrl: string | null; isOldStyle?: boolean }

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
  return cn === q || cn.startsWith(q + " ") || cn === q + "-gx" || cn === q + "-ex" || cn.includes("& " + q);
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
        else if (allowRegionalFallback && /^alolan /i.test(c.name)) regionalMatched.push({ ...c, _rarity: rarity });
      }
    }
  }
  // Use regional cards only if no non-regional candidates found
  return matched.length ? matched : regionalMatched;
}

function swshSetNum(setId: string): number {
  const m = setId.match(/^swsh(\d+)/i);
  return m ? parseInt(m[1]) : 0;
}

// Returns true for sets older than BW era (DP, Platinum, HGSS, EX series, Base, Neo, etc.)
// BW introduced full-bleed artwork so bw+ sets look fine as card backgrounds.
function isPreBwSet(setId: string): boolean {
  return !/^(bw|xy|sm|swsh|sv)/i.test(setId);
}

function pickBestCard(cards: RankedCard[]): RankedCard | null {
  if (!cards.length) return null;
  // TG illustration cards get Trainer Gallery Rare Holo score (beats Rare Ultra/V)
  // Rare Ultra from swsh11+ are full-art border reprints, not distinct alt arts — deprioritize below Rare Holo V
  const effectiveScore = (c: RankedCard) => {
    if (TG_RE.test(c.number)) return rarityScore("Trainer Gallery Rare Holo");
    if (c._rarity === "Rare Ultra" && swshSetNum(c.set.id) >= 11) return rarityScore("Rare Holo V") + 1;
    return rarityScore(c._rarity);
  };
  return cards.reduce((a, b) => {
    const ra = effectiveScore(a), rb = effectiveScore(b);
    if (ra !== rb) return ra < rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    // Same rarity + same set: prefer higher number (alt arts are secret-rare numbered)
    const aNum = parseInt(a.number) || 0, bNum = parseInt(b.number) || 0;
    return bNum >= aNum ? b : a;
  });
}

function pickBest(cards: RankedCard[]): string | null {
  const winner = pickBestCard(cards);
  return winner ? cardImageUrl(winner) : null;
}

function pickBestWithChain(cards: RankedCard[], chainSets: Set<string> | undefined): string | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    // TG cards are always eligible — don't filter them by chain set
    const chainCards = cards.filter(c => chainSets.has(c.set.id) || TG_RE.test(c.number));
    if (chainCards.length) return pickBest(chainCards);
  }
  return pickBest(cards);
}

function pickBestCardWithChain(cards: RankedCard[], chainSets: Set<string> | undefined): RankedCard | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    const chainCards = cards.filter(c => chainSets.has(c.set.id) || TG_RE.test(c.number));
    if (chainCards.length) return pickBestCard(chainCards);
  }
  return pickBestCard(cards);
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
    const nameLower = displayName.toLowerCase();
    return rarities.flatMap((r, i) => {
      const candidates = lookupCandidates(indexes[i], displayName, r);
      // For IR only (not SIR): exclude SV-era "Pokémon ex" cards — they're distinct identities.
      // SIR of ex Pokémon (e.g. Mew ex SIR) are always desired and pass through.
      if (r === "Illustration Rare") {
        return candidates.filter(c => c.name.toLowerCase() !== nameLower + " ex");
      }
      return candidates;
    });
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

// SV-era full-art promo set IDs — add new promo sets here as they release
const SV_PROMO_SETS = ["svp", "mep", "mepen"];

// Pass 1.5: SV-era full-art promos, best rarity then highest number wins.
export async function fetchTcgPromoSv(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const perSetCards = await Promise.all(
    SV_PROMO_SETS.map(setId => fetchAllPages(`set.id:${setId} -subtypes:Tera`))
  );
  perSetCards.forEach((cards, i) => { if (cards.length > 0) process.stderr.write(`[promo fetch] set=${SV_PROMO_SETS[i]} count=${cards.length}\n`); });
  const allCards = perSetCards.flat();
  const index = buildNameIndex(allCards);

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
    const best = svpCards.reduce((a, b) => {
      const ra = rarityScore(a.rarity), rb = rarityScore(b.rarity);
      if (ra !== rb) return ra < rb ? a : b;
      return parseInt(b.number) > parseInt(a.number) ? b : a;
    });
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
    const nameLower = displayName.toLowerCase();
    return rarities.flatMap((r, i) =>
      lookupCandidates(indexes[i], displayName, r, { allowGimmick: true })
        .filter(c => {
          // Exclude SV-era "Pokémon ex" cards from VGX — distinct identities from the base form
          if (c.name.toLowerCase() === nameLower + " ex") return false;
          if (!["Rare Ultra", "Rare Secret", "Hyper Rare", "Rare Holo VMAX"].includes(r)) return true;
          if (c.name.endsWith("-GX") && !c.name.includes(" & ")) return false;
          if (/ V(-UNION)?$/.test(c.name) && SWSH_EARLY_SETS.has(c.set.id)) return false;
          if (/ V(-UNION)?$/.test(c.name) && r === "Hyper Rare") return false;
          if (/ VMAX$/.test(c.name)) return false;
          return true;
        })
    );
  });

  const setsByDex = new Map(
    pokemon.map((p, i) => [p.id, new Set(candidatesList[i].map(c => c.set.id))])
  );
  const chainSetsMap = buildChainSets(setsByDex, chainsByDex);

  const OLD_STYLE_RARITIES = new Set(["Rare Holo EX", "Rare Secret", "Rare Ultra"]);
  const isOldStyleCard = (c: RankedCard) => OLD_STYLE_RARITIES.has(c._rarity) && isPreBwSet(c.set.id);

  const entries = pokemon.map(({ id }, i) => {
    const all = candidatesList[i];
    const chainSets = chainSetsMap.get(id);
    // Prefer modern full-art cards over old-style.
    // Modern cards (GX, TAG TEAM, V, etc.) skip chain filtering — they're standalone full-arts
    // that don't need chain set coherence. Old-style cards still use chain filtering.
    const modern = all.filter(c => !isOldStyleCard(c));
    const winner = modern.length
      ? pickBestCard(modern)
      : pickBestCardWithChain(all, chainSets);
    if (!winner) return null;
    return [id, { tcgUrl: cardImageUrl(winner), isOldStyle: isOldStyleCard(winner) }] as const;
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
  if (category === "other") return null;

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
      .filter(c => c.images?.large && (rarities.includes(c.rarity) || c.rarity === "Promo") && nameMatches(c.name, displayName) && !(c.rarity === "Hyper Rare" && / V(-UNION)?$/.test(c.name)))
      .map(c => ({ ...c, _rarity: c.rarity === "Promo" ? "Rare Holo V" : c.rarity }));
    const hasGx = candidates.some(c => c._rarity === "Rare Holo GX");
    // Prefer standard GX card over Full Art (Rare Ultra) when both exist
    const finalCandidates = hasGx ? candidates.filter(c => c._rarity !== "Rare Ultra") : candidates;
    return pickBest(finalCandidates);
  }

  if (category === "gmax") {
    const baseName = displayName.replace(/^Gigantamax /, "").trim();
    const vmaxName = `${baseName} VMAX`;
    // Sets whose Rare Rainbow cards are alt-art illustrations worth showing
    const GMAX_RAINBOW_SETS = new Set(["swsh8"]);
    const cards = await fetchAllPages(`name:"${baseName}" subtypes:VMAX`);
    const candidates = cards
      .filter(c => c.images?.large && nameMatches(c.name, vmaxName) && !c.number.startsWith("SV") && c.set.id !== "swsh45sv" && c.rarity !== "Hyper Rare" && !(c.rarity === "Rare Rainbow" && !GMAX_RAINBOW_SETS.has(c.set.id)) && !(c.rarity === "Rare Secret" && /tg$/i.test(c.set.id)))
      .map(c => ({ ...c, _rarity: c.rarity ?? "Rare Holo VMAX" }));
    if (!candidates.length) return null;
    // Set tier: TG sets (0) > post-swsh45 numbered (1) > promos (2) > early sets (3)
    const gmaxTier = (id: string) =>
      /tg$/i.test(id) ? 0
      : /^swsh([5-9]|1\d)/i.test(id) ? 1
      : id === "swshp" ? 2
      : 3;
    const swshNum = (id: string) => { const m = id.match(/^swsh(\d+)/); return m ? parseInt(m[1]) : 0; };
    const winner = candidates.reduce((a, b) => {
      const ta = gmaxTier(a.set.id), tb = gmaxTier(b.set.id);
      if (ta !== tb) return ta < tb ? a : b;
      if (a.set.id !== b.set.id) {
        const na = swshNum(a.set.id), nb = swshNum(b.set.id);
        if (na !== nb) return nb > na ? b : a;
      }
      return (parseInt(b.number) || 0) >= (parseInt(a.number) || 0) ? b : a;
    });
    return cardImageUrl(winner);
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
    // Final fallback: query by MEGA subtype — catches "M Name-EX" cards where
    // the hyphen in quoted name queries confuses the Lucene parser.
    // Skip for X/Y forms — they need exact card matching to distinguish variants.
    if (!isXY) {
      const subtypeCards = await fetchAllPages(`name:${baseName} subtypes:MEGA`);
      const subtypeCandidates = subtypeCards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && c.name.toLowerCase().includes(baseName.toLowerCase()))
        .map(c => ({ ...c, _rarity: c.rarity }));
      return pickBest(subtypeCandidates);
    }
    return null;
  }

  return null;
}

// Last-resort rarity order for Pokémon with no high-quality card — lower = better display value.
const LAST_RESORT_RARITY: Record<string, number> = {
  "Rare Holo": 0,
  "Rare": 1,
  "Uncommon": 2,
  "Common": 3,
};

// Pass 5: per-Pokémon name fetch for Pokémon with no card from any other pass.
// Picks the highest-rarity card available (any rarity), then newest set as tiebreaker.
// Last-resort lookup for alt forms by display name (already human-readable, no slug conversion needed).
export async function fetchFormCardLastResort(displayName: string): Promise<string | null> {
  const cards = await fetchAllPages(`name:"${displayName}"`);
  const candidates = cards.filter(c =>
    c.images?.large && nameMatches(c.name, displayName)
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const ra = LAST_RESORT_RARITY[a.rarity] ?? 4;
    const rb = LAST_RESORT_RARITY[b.rarity] ?? 4;
    if (ra !== rb) return ra < rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    return parseInt(b.number) > parseInt(a.number) ? b : a;
  });
  return cardImageUrl(best);
}

export async function fetchTcgLastResort(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const results = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const displayName = toDisplayName(name);
      const cards = await fetchAllPages(`name:"${displayName}"`);
      const candidates = cards.filter(c =>
        c.images?.large &&
        nameMatches(c.name, displayName) &&
        !REGIONAL_RE.test(c.name) &&
        !TRAINER_OWNED_RE.test(c.name)
      );
      if (!candidates.length) return null;
      const best = candidates.reduce((a, b) => {
        const ra = LAST_RESORT_RARITY[a.rarity] ?? 4;
        const rb = LAST_RESORT_RARITY[b.rarity] ?? 4;
        if (ra !== rb) return ra < rb ? a : b;
        if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
        return parseInt(b.number) > parseInt(a.number) ? b : a;
      });
      return [id, { tcgUrl: cardImageUrl(best) }] as const;
    })
  );
  return new Map(results.filter((r): r is NonNullable<typeof r> => r !== null));
}

// Rarities considered for the fallback crop card — ordered from rarest to most common.
// VGX Pokémon are already filtered out upstream, so V/VMAX/VSTAR won't appear here.
const FALLBACK_RARITIES = [
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo",
  "Rare Secret",
  "Rare Ultra",
] as const;

// Final fallback: find the rarest available card for Pokémon with no special art.
// Fetches all rarity indexes in parallel, then picks the highest-rarity card per Pokémon.
export async function fetchTcgFallbackArt(
  pokemon: { id: number; name: string }[],
): Promise<Map<number, string>> {
  if (!pokemon.length) return new Map();
  const indexes = await Promise.all(FALLBACK_RARITIES.map(r => fetchRarityIndex(r)));
  const entries = pokemon.map(({ id, name }) => {
    const displayName = toDisplayName(name);
    const allCandidates: RankedCard[] = FALLBACK_RARITIES.flatMap((r, i) =>
      lookupCandidates(indexes[i], displayName, r, { allowGimmick: true })
    );
    const url = pickBest(allCandidates);
    return url ? [id, url] as const : null;
  });
  return new Map(entries.filter((e): e is [number, string] => e !== null));
}
