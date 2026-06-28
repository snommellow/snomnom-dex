// pokemontcg.io — used only for nationalPokedexNumbers set membership data
// to enable cross-set chain detection for evolution lines.
// Card images come from TCGdex; this API provides broader set coverage.

const BASE = "https://api.pokemontcg.io/v2";

// pokemontcg.io set IDs → TCGdex set IDs (where they differ)
const SET_ID_MAP: Record<string, string> = {
  "sv3pt5":  "sv03.5",  // Pokémon 151
  "sv4pt5":  "sv04.5",  // Paldean Fates
  "sv6pt5":  "sv06.5",  // Shrouded Fable
  "sv8pt5":  "sv08.5",  // Prismatic Evolutions
};

function toTcgdexSetId(ptcgId: string): string {
  return SET_ID_MAP[ptcgId] ?? ptcgId;
}

interface PtcgCard {
  set: { id: string };
  nationalPokedexNumbers: number[];
}

interface PtcgResponse {
  data: PtcgCard[];
  totalCount: number;
  pageSize: number;
}

function mergeInto(result: Map<number, Set<string>>, cards: PtcgCard[], minDex: number, maxDex: number) {
  for (const card of cards) {
    const setId = toTcgdexSetId(card.set.id);
    for (const dexNum of card.nationalPokedexNumbers) {
      if (dexNum < minDex || dexNum > maxDex) continue;
      const existing = result.get(dexNum);
      if (existing) existing.add(setId);
      else result.set(dexNum, new Set([setId]));
    }
  }
}

// Batch-fetch all card set memberships for dex numbers in [minDex, maxDex].
// Fetches page 1 to get total count, then fetches remaining pages in parallel.
// Returns Map<dexId, Set<tcgdexSetId>>.
export async function fetchPtcgSetsByDexRange(
  minDex: number,
  maxDex: number,
): Promise<Map<number, Set<string>>> {
  const result = new Map<number, Set<string>>();
  const PAGE_SIZE = 250;
  const url = (page: number) =>
    `${BASE}/cards?q=nationalPokedexNumbers:[${minDex}+TO+${maxDex}]` +
    `&select=set,nationalPokedexNumbers&pageSize=${PAGE_SIZE}&page=${page}`;

  try {
    const firstRes = await fetch(url(1), { next: { revalidate: 86400 } });
    if (!firstRes.ok) return result;
    const firstData = (await firstRes.json()) as PtcgResponse;
    mergeInto(result, firstData.data, minDex, maxDex);

    const totalPages = Math.ceil(firstData.totalCount / PAGE_SIZE);
    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(url(i + 2), { next: { revalidate: 86400 } })
            .then(r => r.ok ? r.json() as Promise<PtcgResponse> : null)
            .catch(() => null)
        )
      );
      for (const data of rest) {
        if (data) mergeInto(result, data.data, minDex, maxDex);
      }
    }
  } catch { /* return partial result */ }

  return result;
}
