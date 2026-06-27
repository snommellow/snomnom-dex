// TCGdex API — English TCG card lookup (https://tcgdex.dev)
// Replaces pokemontcg.io; uses the same base URL as pocketapi.ts

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// Unified rarity priority — lower index = better card
const RARITY_ORDER = [
  "Special illustration rare",
  "Illustration rare",
  "Hyper rare",       // Secret Rare equivalent (full-art SIR-tier for older sets)
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
// TCGdex classifies these as "Rare" so we detect them by localId instead of rarity.
const TG_RE = /^TG\d+$/;

const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;
const TRAINER_OWNED_RE = /'\s*s\s+/i;
// VMAX/VSTAR in the card name signals a gimmick form — excluded from the main Pokémon slot
// but allowed when fetching alt-form cards.
const MAIN_GIMMICK_RE = /\b(VMAX|VSTAR|V-UNION)\b/i;

// Cards to exclude due to API misclassification (e.g. chain holos tagged as IR)
const CARD_BLACKLIST = new Set<string>([]);

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

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

function pickBest(cards: Array<TcgdexCard & { _rarity: string }>): string | null {
  if (!cards.length) return null;
  const winner = cards.reduce((a, b) => {
    const ra = rarityScore(a._rarity), rb = rarityScore(b._rarity);
    if (ra !== rb) return ra < rb ? a : b;
    // Prefer newer set (sv06 > sv01, swsh12 > swsh01)
    return setIdFromCardId(b.id) > setIdFromCardId(a.id) ? b : a;
  });
  return cardImageUrl(winner);
}

interface FetchOptions {
  allowTrainerOwned?: boolean;
  allowGimmick?: boolean;
  skipRegionalFilter?: boolean;
}

async function fetchBestByRarities(
  displayName: string,
  rarities: string[],
  { allowTrainerOwned = false, allowGimmick = false, skipRegionalFilter = false }: FetchOptions = {},
): Promise<string | null> {
  const results = await Promise.all(rarities.map(r => tcgFetch(displayName, r)));
  const cards = results.flatMap((list, i) =>
    list
      .filter(c =>
        c.image &&
        !CARD_BLACKLIST.has(c.id) &&
        (skipRegionalFilter || !REGIONAL_RE.test(c.name)) &&
        (allowTrainerOwned  || !TRAINER_OWNED_RE.test(c.name)) &&
        (allowGimmick       || !MAIN_GIMMICK_RE.test(c.name))
      )
      .map(c => ({ ...c, _rarity: rarities[i] }))
  );
  return pickBest(cards);
}

// Pass 1: IR / SIR — highest quality full-art illustration cards
export async function fetchTcgIrSir(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  const entries = await Promise.all(
    pokemon.map(async ({ id, name }) => {
      const url = await fetchBestByRarities(
        toDisplayName(name),
        ["Special illustration rare", "Illustration rare"],
      );
      return url ? [id, { tcgUrl: url }] as const : null;
    })
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Pass 2.1: Trainer-owned IR/SIR (e.g. "Erika's Clefable")
// TCGdex name search won't return "Erika's Clefable" for a "Clefable" query,
// so we fetch the exact trainer-owned name using the allowTrainerOwned filter.
// Callers pass Pokémon that already had no non-trainer IR found; we try their
// display name as-is — if the TCGdex card name includes the trainer, it'll match.
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

// Alt-form card lookup — IR → TG (regional only) → VGX, with Mega name fallbacks
export async function fetchFormCard(
  category: "mega" | "regional" | "gmax" | "other",
  _dexId: number,
  displayName: string,
  _formTypes: string[] = [],
  raritySet: Set<string> = VGX_RARITIES,
): Promise<string | null> {
  if (category === "gmax" || category === "other") return null;

  const rarities = RARITY_ORDER.filter(r => raritySet.has(r));
  const opts: FetchOptions = { skipRegionalFilter: true, allowGimmick: true };

  if (category === "regional") {
    if (raritySet === IR_RARITIES) {
      return fetchBestByRarities(displayName, rarities, opts);
    }
    // VGX pass: check Trainer Gallery cards first — they rank above Ultra Rare
    const allCards = await tcgFetch(displayName);
    const tgCards = allCards.filter(c => c.image && TG_RE.test(c.localId));
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

    for (const name of namesToTry) {
      const url = await fetchBestByRarities(name, rarities, opts);
      if (url) return url;
    }
    return null;
  }

  return null;
}
