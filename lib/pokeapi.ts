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

export type FormCategory = "mega" | "regional" | "gmax" | "other";

export interface AltForm {
  slug: string;
  displayName: string;
  types: string[];
  artworkUrl: string | null;
  category: FormCategory;
  tcgUrl: string | null;
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

export async function fetchPokemon(
  nameOrId: string | number
): Promise<Pokemon | null> {
  try {
    const res = await fetch(`${BASE_URL}/pokemon/${nameOrId}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function fetchFirst151(): Promise<Pokemon[]> {
  const list = await fetchPokemonList(151);
  const results = await Promise.all(list.map((p) => fetchPokemon(p.name)));
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
  altForms: AltForm[];
}

// Single species fetch: returns genus + non-default form slots
export async function fetchSpeciesData(id: number): Promise<{
  genus: string | null;
  altFormSlots: Array<{ name: string; url: string }>;
}> {
  try {
    const res = await fetch(`${BASE_URL}/pokemon-species/${id}`, { next: { revalidate: 86400 } });
    if (!res.ok) return { genus: null, altFormSlots: [] };
    const data = await res.json();
    const entry = (data.genera as { genus: string; language: { name: string } }[])
      .find((g) => g.language.name === "en");
    const alts = (data.varieties as Array<{ is_default: boolean; pokemon: { name: string; url: string } }>)
      .filter(v => !v.is_default)
      .map(v => v.pokemon);
    return { genus: entry?.genus ?? null, altFormSlots: alts };
  } catch { return { genus: null, altFormSlots: [] }; }
}

// Keep for any callers that only need the genus string
export async function fetchGenus(id: number): Promise<string | null> {
  const { genus } = await fetchSpeciesData(id);
  return genus;
}

function parseFormSlug(slug: string, baseName: string): { displayName: string; category: FormCategory } {
  const suffix = slug.startsWith(baseName + "-") ? slug.slice(baseName.length + 1) : slug;
  const cap = (s: string) => s.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const base = cap(baseName);

  if (suffix === "mega")   return { displayName: `Mega ${base}`,    category: "mega" };
  if (suffix === "mega-x") return { displayName: `Mega ${base} X`,  category: "mega" };
  if (suffix === "mega-y") return { displayName: `Mega ${base} Y`,  category: "mega" };
  if (suffix === "alola")  return { displayName: `Alolan ${base}`,  category: "regional" };
  if (suffix === "galar")  return { displayName: `Galarian ${base}`,category: "regional" };
  if (suffix === "hisui")  return { displayName: `Hisuian ${base}`, category: "regional" };
  if (suffix === "paldea") return { displayName: `Paldean ${base}`, category: "regional" };
  if (suffix === "gmax")   return { displayName: `Gigantamax ${base}`, category: "gmax" };
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
          category,
          tcgUrl: null,
        } as AltForm;
      } catch { return null; }
    })
  );
  return forms.filter((f): f is AltForm => f !== null);
}

export function toPokemonSummary(
  p: Pokemon,
  tcgResult: { tcgUrl: string | null } = { tcgUrl: null },
  pocketUrls: string[] = [],
  genus: string | null = null,
  altForms: AltForm[] = [],
): PokemonSummary {
  const bg: string[] = [];
  if (tcgResult.tcgUrl) bg.push(tcgResult.tcgUrl);
  bg.push(...pocketUrls);
  return {
    id: p.id,
    name: p.name,
    types: p.types.map((t) => t.type.name),
    spriteUrl: p.sprites.front_default,
    artworkUrl: p.sprites.other["official-artwork"].front_default,
    genus,
    bgCandidates: bg,
    altForms,
  };
}
