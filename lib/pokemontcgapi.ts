// pokemontcg.io — used only for nationalPokedexNumbers set membership data
// to enable cross-set chain detection for evolution lines.
// Card images come from TCGdex; this API provides broader set coverage.

const BASE = "https://api.pokemontcg.io/v2";

// pokemontcg.io set IDs that differ from TCGdex set IDs
const SET_ID_MAP: Record<string, string> = {
  "sv3pt5":  "sv2a",    // Pokémon 151
  "sv4pt5":  "sv3pt5",  // Paldean Fates
  "sv6pt5":  "sv6pt5",  // Shrouded Fable (likely same, confirm if wrong)
  "sv8pt5":  "sv8pt5",  // Prismatic Evolutions (likely same)
};

function toTcgdexSetId(ptcgId: string): string {
  return SET_ID_MAP[ptcgId] ?? ptcgId;
}

interface PtcgCard {
  set: { id: string };
  nationalPokedexNumbers: number[];
}

// Batch-fetch all card set memberships for dex numbers in [minDex, maxDex].
// Uses a single paginated query rather than one request per Pokémon.
// Returns Map<dexId, Set<tcgdexSetId>>.
export async function fetchPtcgSetsByDexRange(
  minDex: number,
  maxDex: number,
): Promise<Map<number, Set<string>>> {
  const result = new Map<number, Set<string>>();
  let page = 1;

  while (true) {
    try {
      const res = await fetch(
        `${BASE}/cards?q=nationalPokedexNumbers:[${minDex}+TO+${maxDex}]` +
        `&select=set,nationalPokedexNumbers&pageSize=250&page=${page}`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const cards = data.data as PtcgCard[];

      for (const card of cards) {
        const setId = toTcgdexSetId(card.set.id);
        for (const dexNum of card.nationalPokedexNumbers) {
          if (dexNum < minDex || dexNum > maxDex) continue;
          const existing = result.get(dexNum);
          if (existing) existing.add(setId);
          else result.set(dexNum, new Set([setId]));
        }
      }

      if (cards.length < 250) break;
      page++;
    } catch { break; }
  }

  return result;
}
