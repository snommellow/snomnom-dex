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
  const res = await fetch(
    `${BASE_URL}/pokemon?limit=${limit}&offset=${offset}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) throw new Error("Failed to fetch Pokémon list");
  const data = await res.json();
  return data.results as PokemonListItem[];
}

export async function fetchPokemon(
  nameOrId: string | number
): Promise<Pokemon> {
  const res = await fetch(`${BASE_URL}/pokemon/${nameOrId}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Failed to fetch Pokémon: ${nameOrId}`);
  return res.json();
}

export async function fetchFirst151(): Promise<Pokemon[]> {
  const list = await fetchPokemonList(151);
  const pokemon = await Promise.all(list.map((p) => fetchPokemon(p.name)));
  return pokemon;
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
  tcgResult: { pokeosUrl: string | null; pokeosAltUrl?: string | null; tcgUrl: string | null } = { pokeosUrl: null, tcgUrl: null },
  pocketImageUrl: string | null = null,
): PokemonSummary {
  const bg: string[] = [];
  if (tcgResult.pokeosUrl) bg.push(tcgResult.pokeosUrl);
  if (tcgResult.pokeosAltUrl) bg.push(tcgResult.pokeosAltUrl);
  if (tcgResult.tcgUrl) bg.push(tcgResult.tcgUrl);
  if (pocketImageUrl) bg.push(pocketImageUrl);
  return {
    id: p.id,
    name: p.name,
    types: p.types.map((t) => t.type.name),
    spriteUrl: p.sprites.front_default,
    artworkUrl: p.sprites.other["official-artwork"].front_default,
    bgCandidates: bg,
  };
}
