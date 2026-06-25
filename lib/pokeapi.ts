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
  // Ordered candidates for card background: PokéOS textless → TCG image → Pocket → official art
  bgCandidates: string[];
}

export function toPokemonSummary(
  p: Pokemon,
  tcgResult: { tcgUrl: string | null } = { tcgUrl: null },
  pocketUrls: string[] = [],
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
    bgCandidates: bg,
  };
}
