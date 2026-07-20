const BASE_URL = "https://pokeapi.co/api/v2";

export interface PokemonType {
  slot: number;
  type: { name: string; url: string };
}

export interface PokemonSprites {
  front_default: string | null;
  other: {
    "official-artwork": { front_default: string | null };
  };
}

export interface Pokemon {
  id: number;
  name: string;
  types: PokemonType[];
  sprites: PokemonSprites;
}

export interface PokemonListItem {
  name: string;
  url: string;
}

export type FormCategory = "mega" | "regional" | "gmax" | "primal" | "forme" | "other";

export interface AltForm {
  slug: string;
  displayName: string;
  types: string[];
  artworkUrl: string | null;
  category: FormCategory;
  tcgUrl: string | null;
  regularCardUrl?: string | null;
  formSpriteUrl?: string | null;
  homeSpriteUrl: string | null;
  // Priority-tier rank of tcgUrl (lower = better), using the same tier order as the base
  // Pokémon's own card. Undefined when tcgUrl is null or came from a manual/random pick not
  // ranked against the shared tiers. Lets the alt-forms filter show this card on the base
  // entity when its category is hidden but its card outranks the base's own card.
  cardRank?: number;
}

export async function fetchPokemonList(
  limit = 151,
  offset = 0
): Promise<PokemonListItem[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/pokemon?limit=${limit}&offset=${offset}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.results as PokemonListItem[];
  } catch { return []; }
}

// Retries, like fetchAllPages/imageExists in lib/tcgapi.ts — firing 1025+ concurrent requests
// at once (see fetchFirst151 below) was silently dropping a handful of Pokémon under load with
// no retry, since a single transient failure here just returns null and gets filtered out with
// no trace (confirmed as the root cause of dex 1022-1025 going missing despite the PokeAPI list
// and individual fetches both working fine in isolation).
export async function fetchPokemon(
  nameOrId: string | number
): Promise<Pokemon | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
      const res = await fetch(`${BASE_URL}/pokemon/${nameOrId}`, {
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch { /* retry */ }
  }
  process.stderr.write(`[fetchPokemon] giving up on "${nameOrId}" after 4 attempts\n`);
  return null;
}

// Bounds concurrency so 1000+ Pokémon don't all hit pokeapi.co at once — reduces the rate of
// transient failures fetchPokemon's retries above have to absorb in the first place.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function fetchFirst151(): Promise<Pokemon[]> {
  const list = await fetchPokemonList(1025);
  const results = await mapWithConcurrency(list, 20, (p) => fetchPokemon(p.name));
  return results.filter((p): p is Pokemon => p !== null);
}

// Pull out just what the UI needs so client bundles stay lean
export interface PokemonSummary {
  id: number;
  name: string;
  types: string[];
  spriteUrl: string | null;
  artworkUrl: string | null;
  genus: string | null;
  // Ordered candidates for card background: TCG image → Pocket → official art
  bgCandidates: string[];
  // Regular TCG card used as artwork-only fallback (cropped to art area in UI)
  regularCardUrl?: string;
  altForms: AltForm[];
  // Evolution family grouping for the "family view" sort. familyId is the lowest dex number
  // among all members of this Pokémon's evolution chain (used to position the family group
  // relative to others); familyOrder is this Pokémon's index within the chain's evolution
  // order (baby → basic → stage 1 → stage 2), used to order members within the group.
  familyId: number;
  familyOrder: number;
  // Priority-tier rank of this entity's own card (see AltForm.cardRank for the full explanation).
  cardRank?: number;
}

// Single species fetch: returns genus + non-default form slots + evolution chain URL
export async function fetchSpeciesData(id: number): Promise<{
  genus: string | null;
  altFormSlots: Array<{ name: string; url: string }>;
  evolutionChainUrl: string | null;
}> {
  try {
    const res = await fetch(`${BASE_URL}/pokemon-species/${id}`, { next: { revalidate: 86400 } });
    if (!res.ok) return { genus: null, altFormSlots: [], evolutionChainUrl: null };
    const data = await res.json();
    const entry = (data.genera as { genus: string; language: { name: string } }[])
      .find((g) => g.language.name === "en");
    const alts = (data.varieties as Array<{ is_default: boolean; pokemon: { name: string; url: string } }>)
      .filter(v => !v.is_default)
      .map(v => v.pokemon);
    return {
      genus: entry?.genus ?? null,
      altFormSlots: alts,
      evolutionChainUrl: (data.evolution_chain as { url: string } | null)?.url ?? null,
    };
  } catch { return { genus: null, altFormSlots: [], evolutionChainUrl: null }; }
}

interface EvolutionNode {
  species: { url: string };
  evolves_to: EvolutionNode[];
}

function extractChainIds(node: EvolutionNode): number[] {
  const parts = node.species.url.split("/").filter(Boolean);
  const id = parseInt(parts[parts.length - 1] ?? "0");
  return [id, ...node.evolves_to.flatMap(extractChainIds)];
}

// Fetch all dex IDs in an evolution chain (including branching, e.g. Eevee)
export async function fetchEvolutionChainIds(url: string): Promise<number[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    return extractChainIds(data.chain as EvolutionNode);
  } catch { return []; }
}

// Keep for any callers that only need the genus string
export async function fetchGenus(id: number): Promise<string | null> {
  const { genus } = await fetchSpeciesData(id);
  return genus;
}

const FORM_BASE_NAME_OVERRIDES: Record<string, string> = {
  "farfetchd": "Farfetch'd",
  "mr-mime":   "Mr. Mime",
  "ho-oh":     "Ho-Oh",
};

// PokeAPI's default list entry for these species isn't the plain species name (e.g. Deoxys'
// default variety is "deoxys-normal", not "deoxys"), so form-slug prefix stripping below
// would otherwise never match its own sibling forms ("deoxys-attack" doesn't start with
// "deoxys-normal-").
const BASE_SLUG_OVERRIDES: Record<string, string> = {
  "deoxys-normal": "deoxys",
  "wormadam-plant": "wormadam",
  "giratina-altered": "giratina",
  "shaymin-land": "shaymin",
  "basculin-red-striped": "basculin",
  "darmanitan-standard": "darmanitan",
  "frillish-male": "frillish",
  "jellicent-male": "jellicent",
  "tornadus-incarnate": "tornadus",
  "thundurus-incarnate": "thundurus",
  "landorus-incarnate": "landorus",
  "keldeo-ordinary": "keldeo",
  "meloetta-aria": "meloetta",
  "pyroar-male": "pyroar",
  "meowstic-male": "meowstic",
  "aegislash-shield": "aegislash",
  "pumpkaboo-average": "pumpkaboo",
  "gourgeist-average": "gourgeist",
  "zygarde-50": "zygarde",
  "oricorio-baile": "oricorio",
  "lycanroc-midday": "lycanroc",
  "minior-red-meteor": "minior",
  "mimikyu-disguised": "mimikyu",
  "toxtricity-amped": "toxtricity",
  "indeedee-male": "indeedee",
  "morpeko-full-belly": "morpeko",
  "urshifu-single-strike": "urshifu",
  "basculegion-male": "basculegion",
  "enamorus-incarnate": "enamorus",
  "oinkologne-male": "oinkologne",
  "maushold-family-of-four": "maushold",
  "squawkabilly-green-plumage": "squawkabilly",
  "palafin-zero": "palafin",
  "tatsugiri-curly": "tatsugiri",
  "dudunsparce-two-segment": "dudunsparce",
  "wishiwashi-solo": "wishiwashi",
  "eiscue-ice": "eiscue",
};

function parseFormSlug(slug: string, rawBaseName: string): { displayName: string; category: FormCategory } {
  const baseName = BASE_SLUG_OVERRIDES[rawBaseName] ?? rawBaseName;
  const suffix = slug.startsWith(baseName + "-") ? slug.slice(baseName.length + 1) : slug;
  const cap = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const base = FORM_BASE_NAME_OVERRIDES[baseName] ?? cap(baseName);

  if (suffix === "mega")   return { displayName: `Mega ${base}`,    category: "mega" };
  if (suffix === "mega-x") return { displayName: `Mega ${base} X`,  category: "mega" };
  if (suffix === "mega-y") return { displayName: `Mega ${base} Y`,  category: "mega" };
  if (suffix === "alola")  return { displayName: `Alolan ${base}`,  category: "regional" };
  if (suffix === "galar")  return { displayName: `Galarian ${base}`,category: "regional" };
  if (suffix === "hisui")  return { displayName: `Hisuian ${base}`, category: "regional" };
  if (suffix === "paldea") return { displayName: `Paldean ${base}`, category: "regional" };
  if (suffix === "gmax")   return { displayName: `Gigantamax ${base}`, category: "gmax" };
  if (suffix === "primal") return { displayName: `Primal ${base}`, category: "primal" };
  if (suffix === "attack")  return { displayName: `Attack Forme ${base}`,  category: "forme" };
  if (suffix === "defense") return { displayName: `Defense Forme ${base}`, category: "forme" };
  if (suffix === "speed")   return { displayName: `Speed Forme ${base}`,   category: "forme" };
  if (suffix === "sunny")   return { displayName: `Sunny Forme ${base}`,  category: "forme" };
  if (suffix === "rainy")   return { displayName: `Rainy Forme ${base}`,  category: "forme" };
  if (suffix === "snowy")   return { displayName: `Snowy Forme ${base}`,  category: "forme" };
  // Paldean Tauros' three breeds: Combat is the plain "Paldean Tauros" (auto-resolves via the
  // generic regional search below); Blaze/Aqua share that same card name in the TCG with no
  // distinguishing text, so they're hardcoded like Deoxys'/Castform's forme-only variants.
  if (suffix === "paldea-combat-breed") return { displayName: `Paldean ${base}`, category: "regional" };
  if (suffix === "paldea-blaze-breed")  return { displayName: `Blaze Breed Paldean ${base}`, category: "forme" };
  if (suffix === "paldea-aqua-breed")   return { displayName: `Aqua Breed Paldean ${base}`,  category: "forme" };
  if (suffix === "sandy") return { displayName: `Sandy Cloak ${base}`, category: "forme" };
  if (suffix === "trash") return { displayName: `Trash Cloak ${base}`, category: "forme" };
  // Dialga/Palkia/Giratina's Origin Formes are literally named "Origin Forme Dialga VSTAR"/
  // etc in the TCG (unlike Shaymin's Sky Forme, which shares its card name with Land Forme) —
  // auto-searchable, so reuse "regional"'s full-displayName search instead of "forme".
  if (suffix === "origin") return { displayName: `Origin Forme ${base}`, category: "regional" };
  if (suffix === "sky") return { displayName: `Sky Forme ${base}`, category: "forme" };
  // Rotom's appliance formes are literally named "Heat Rotom"/"Wash Rotom"/etc in the TCG, so
  // (unlike Deoxys/Castform) they're auto-searchable — reuse "regional"'s prefix+base search
  // behavior instead of hardcoding, even though it's not a real-world region.
  if (suffix === "heat")  return { displayName: `Heat ${base}`,  category: "regional" };
  if (suffix === "wash")  return { displayName: `Wash ${base}`,  category: "regional" };
  if (suffix === "frost") return { displayName: `Frost ${base}`, category: "regional" };
  if (suffix === "fan")   return { displayName: `Fan ${base}`,   category: "regional" };
  if (suffix === "mow")   return { displayName: `Mow ${base}`,   category: "regional" };
  // Kyurem's fusion formes are literally named "White Kyurem"/"Black Kyurem" in the TCG
  // (no "Forme" text), so auto-searchable like Rotom's appliance formes above.
  if (suffix === "white") return { displayName: `White ${base}`, category: "regional" };
  if (suffix === "black") return { displayName: `Black ${base}`, category: "regional" };
  // Tornadus/Thundurus/Landorus' Therian Formes, Darmanitan's Zen Mode, Keldeo's Resolute Forme,
  // Meloetta's Pirouette Forme, and Basculin's Blue-Striped form aren't distinguished by card
  // name in the TCG (same printing serves both formes), so treat as "forme" like Deoxys/Castform
  // — auto-search can't tell them apart, so they need per-form hardcoding to differ from base.
  if (suffix === "therian")    return { displayName: `Therian Forme ${base}`, category: "forme" };
  if (suffix === "zen")        return { displayName: `Zen Mode ${base}`, category: "forme" };
  if (suffix === "galar-zen")  return { displayName: `Zen Mode Galarian ${base}`, category: "forme" };
  // Darmanitan's plain Galarian variety slug carries a "-standard" suffix (unlike other
  // regional forms), so the generic "galar" branch above never matches it — same root cause as
  // the "-zen"/"-galar-zen" cases.
  if (suffix === "galar-standard") return { displayName: `Galarian ${base}`, category: "regional" };
  if (suffix === "resolute")   return { displayName: `Resolute Forme ${base}`, category: "forme" };
  if (suffix === "pirouette")  return { displayName: `Pirouette Forme ${base}`, category: "forme" };
  if (suffix === "blue-striped") return { displayName: `Blue-Striped ${base}`, category: "forme" };
  if (suffix === "white-striped") return { displayName: `White-Striped ${base}`, category: "forme" };
  // Ash-Greninja (Battle Bond power-up transformation) is literally named "Ash-Greninja" in the
  // TCG (hyphenated, no space), so auto-searchable like Rotom's appliance formes.
  if (suffix === "ash") return { displayName: `Ash-${base}`, category: "regional" };
  // Hoopa Unbound, Zygarde's 10%/Complete Formes, and Aegislash's Blade Forme all share their
  // base form's plain card name in the TCG (confirmed via search — no "Hoopa Unbound"/"Blade
  // Forme Aegislash" card exists), so treated as "forme" like Deoxys/Castform.
  if (suffix === "unbound")  return { displayName: `Hoopa Unbound`, category: "forme" };
  if (suffix === "10")       return { displayName: `10% Forme ${base}`, category: "forme" };
  if (suffix === "complete") return { displayName: `Complete Forme ${base}`, category: "forme" };
  if (suffix === "blade")    return { displayName: `Blade Forme ${base}`, category: "forme" };
  // Pumpkaboo/Gourgeist size variants: no TCG printing distinguishes sizes by name, AND no
  // full-art printing exists for any size yet (confirmed via search — every card is a plain
  // Common), so these get a randomized pick among the shared candidate pool instead of a price
  // ranking — see randomFormePick in generate-pokemon-data.ts. Revisit if an IR/SIR appears.
  if (suffix === "small") return { displayName: `Small ${base}`, category: "forme" };
  if (suffix === "large") return { displayName: `Large ${base}`,  category: "forme" };
  if (suffix === "super") return { displayName: `Super ${base}`,  category: "forme" };
  // Necrozma/Zacian/Zamazenta/Eternatus/Calyrex/Urshifu/Ogerpon's alt formes are all literally
  // named that way in the TCG (e.g. "Dusk Mane Necrozma", "Crowned Sword Zacian", "Ice Rider
  // Calyrex", "Rapid Strike Urshifu", "Wellspring Mask Ogerpon"), so auto-searchable.
  if (suffix === "dusk" && base !== "Lycanroc") return { displayName: `Dusk Mane ${base}`, category: "regional" };
  if (suffix === "dawn")   return { displayName: `Dawn Wings ${base}`, category: "regional" };
  if (suffix === "ultra")  return { displayName: `Ultra ${base}`, category: "regional" };
  if (suffix === "crowned") return { displayName: `Crowned ${base === "Zacian" ? "Sword" : "Shield"} ${base}`, category: "regional" };
  if (suffix === "eternamax") return { displayName: `Eternamax ${base}`, category: "regional" };
  if (suffix === "rapid-strike") return { displayName: `Rapid Strike ${base}`, category: "regional" };
  if (suffix === "ice")    return { displayName: `Ice Rider ${base}`, category: "regional" };
  if (suffix === "shadow") return { displayName: `Shadow Rider ${base}`, category: "regional" };
  if (suffix === "bloodmoon") return { displayName: `Bloodmoon ${base}`, category: "regional" };
  if (suffix === "wellspring-mask")  return { displayName: `Wellspring Mask ${base}`, category: "regional" };
  if (suffix === "hearthflame-mask") return { displayName: `Hearthflame Mask ${base}`, category: "regional" };
  if (suffix === "cornerstone-mask") return { displayName: `Cornerstone Mask ${base}`, category: "regional" };
  // Gigantamax Urshifu/Toxtricity have two distinct Gigantamax forms (one per base variant),
  // unlike every other Gigantamax species which only has one — so these need their own suffix
  // branches rather than the generic "gmax" one, to keep both distinct.
  if (suffix === "single-strike-gmax") return { displayName: `Gigantamax Single Strike ${base}`, category: "gmax" };
  if (suffix === "rapid-strike-gmax")  return { displayName: `Gigantamax Rapid Strike ${base}`, category: "gmax" };
  if (suffix === "amped-gmax")  return { displayName: `Gigantamax Amped ${base}`, category: "gmax" };
  if (suffix === "low-key-gmax") return { displayName: `Gigantamax Low Key ${base}`, category: "gmax" };
  // These cosmetic/gender/color variants aren't distinguished by card name in the TCG (every
  // printing shares the base form's card name), so treated as "forme" like Deoxys/Castform.
  if (suffix === "female")        return { displayName: `Female ${base}`, category: "forme" };
  if (suffix === "family-of-three") return { displayName: `Family of Three ${base}`, category: "forme" };
  if (suffix === "blue-plumage")   return { displayName: `Blue Plumage ${base}`, category: "forme" };
  if (suffix === "yellow-plumage") return { displayName: `Yellow Plumage ${base}`, category: "forme" };
  if (suffix === "white-plumage")  return { displayName: `White Plumage ${base}`, category: "forme" };
  if (suffix === "droopy")   return { displayName: `Droopy Form ${base}`, category: "forme" };
  if (suffix === "stretchy") return { displayName: `Stretchy Form ${base}`, category: "forme" };
  if (suffix === "three-segment") return { displayName: `Three-Segment Form ${base}`, category: "forme" };
  if (suffix === "hero") return { displayName: `Hero Form ${base}`, category: "forme" };
  if (suffix === "roaming") return { displayName: `Roaming Form ${base}`, category: "forme" };
  if (suffix === "low-key") return { displayName: `Low Key Form ${base}`, category: "forme" };
  if (suffix === "noice")   return { displayName: `Noice Face ${base}`, category: "forme" };
  if (suffix === "hangry")  return { displayName: `Hangry Mode ${base}`, category: "forme" };
  if (suffix === "pom-pom") return { displayName: `Pom-Pom Style ${base}`, category: "forme" };
  if (suffix === "pau")     return { displayName: `Pa'u Style ${base}`, category: "forme" };
  if (suffix === "sensu")   return { displayName: `Sensu Style ${base}`, category: "forme" };
  if (suffix === "midnight") return { displayName: `Midnight Form ${base}`, category: "forme" };
  if (suffix === "dusk" && base === "Lycanroc") return { displayName: `Dusk Form ${base}`, category: "forme" };
  if (suffix === "school") return { displayName: `School Form ${base}`, category: "forme" };
  if (suffix === "busted") return { displayName: `Busted Form ${base}`, category: "forme" };
  // Terapagos' Terastal/Stellar Formes aren't distinguished by card name in the TCG (every
  // printing is just plain "Terapagos"/"Terapagos ex"), so treated as "forme" like Deoxys/
  // Castform — needs manual hardcoding to differ from the Normal Form base.
  if (suffix === "terastal") return { displayName: `Terastal Forme ${base}`, category: "forme" };
  if (suffix === "stellar")  return { displayName: `Stellar Forme ${base}`,  category: "forme" };
  return { displayName: cap(slug), category: "other" };
}

export async function fetchAltForms(
  baseName: string,
  slots: Array<{ name: string; url: string }>
): Promise<AltForm[]> {
  if (!slots.length) return [];
  const forms = await Promise.all(
    slots.map(async ({ name: slug, url }) => {
      try {
        const res = await fetch(url, { next: { revalidate: 86400 } });
        if (!res.ok) return null;
        const p = await res.json();
        const { displayName, category } = parseFormSlug(slug, baseName);
        return {
          slug,
          displayName,
          types: (p.types as PokemonType[]).map(t => t.type.name),
          artworkUrl: p.sprites?.other?.["official-artwork"]?.front_default ?? null,
          formSpriteUrl: p.sprites?.other?.["official-artwork"]?.front_default ?? p.sprites?.front_default ?? null,
          // The base Pokémon's HOME sprite (keyed by national dex ID) would show the wrong
          // form here — each alt form has its own numeric id with its own HOME sprite.
          homeSpriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${p.id}.png`,
          category,
          tcgUrl: null,
        } as AltForm;
      } catch { return null; }
    })
  );
  // Exclude "other" category — totem, starter, hat variants, etc. are not meaningful alt forms
  return forms.filter((f): f is AltForm => f !== null && f.category !== "other");
}

export function toPokemonSummary(
  p: Pokemon,
  tcgResult: { tcgUrl: string | null; isOldStyle?: boolean } = { tcgUrl: null },
  pocketUrls: string[] = [],
  genus: string | null = null,
  altForms: AltForm[] = [],
  regularCardUrl?: string,
  family?: { familyId: number; familyOrder: number },
  cardRank?: number,
): PokemonSummary {
  const bg: string[] = [];
  let resolvedRegularCard = regularCardUrl;
  if (tcgResult.tcgUrl) {
    if (tcgResult.isOldStyle) {
      // Old-style EX/GX cards: use crop treatment — always prefer over plain Rare Holo fallback
      resolvedRegularCard = tcgResult.tcgUrl;
    } else {
      bg.push(tcgResult.tcgUrl);
    }
  }
  bg.push(...pocketUrls);
  return {
    id: p.id,
    name: p.name,
    types: p.types.map((t) => t.type.name),
    spriteUrl: p.sprites.front_default,
    artworkUrl: p.sprites.other["official-artwork"].front_default,
    genus,
    bgCandidates: bg,
    regularCardUrl: resolvedRegularCard,
    altForms,
    familyId: family?.familyId ?? p.id,
    familyOrder: family?.familyOrder ?? 0,
    cardRank,
  };
}
