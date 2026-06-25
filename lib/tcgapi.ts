const TCG_BASE = "https://api.pokemontcg.io/v2/cards";

export interface TcgImages {
  small: string;
  large: string;
}

// Search by exact name + national dex number so we always get the right Pokémon.
// Returns the large card image URL, or null on any failure (rate-limit, no results, etc.)
export async function fetchTcgCardImage(
  name: string,
  dexNumber: number
): Promise<string | null> {
  try {
    // Capitalise name to match TCG API search (e.g. "bulbasaur" → "Bulbasaur")
    const capitalised = name.charAt(0).toUpperCase() + name.slice(1);
    const q = `name:"${capitalised}" nationalPokedexNumbers:${dexNumber}`;
    const url = `${TCG_BASE}?q=${encodeURIComponent(q)}&pageSize=1&select=images`;

    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const images: TcgImages | undefined = data.data?.[0]?.images;
    return images?.large ?? images?.small ?? null;
  } catch {
    return null;
  }
}

// Fetch TCG images for a batch of Pokémon with controlled concurrency so we
// don't fire 151 requests simultaneously and hit the unauthenticated rate limit.
export async function fetchTcgCardImages(
  pokemon: Array<{ name: string; id: number }>
): Promise<(string | null)[]> {
  const CONCURRENCY = 10;
  const results: (string | null)[] = new Array(pokemon.length).fill(null);

  for (let i = 0; i < pokemon.length; i += CONCURRENCY) {
    const batch = pokemon.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((p) => fetchTcgCardImage(p.name, p.id))
    );
    batchResults.forEach((r, j) => {
      results[i + j] = r;
    });
  }

  return results;
}
