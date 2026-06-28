// pokemontcg.io — used only for nationalPokedexNumbers set membership data
// to enable cross-set chain detection for evolution lines.
// Card images come from TCGdex; this API provides broader set coverage.

const PTCG_BASE = "https://api.pokemontcg.io/v2";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

interface PtcgCard {
  set: { id: string };
  nationalPokedexNumbers: number[];
}

interface PtcgResponse {
  data: PtcgCard[];
  totalCount: number;
  pageSize: number;
}

// Build a dynamic map of pokemontcg.io set ID → TCGdex set ID by matching set names.
// Fetched once and cached via ISR.
async function buildSetIdMap(): Promise<Map<string, string>> {
  try {
    const [ptcgRes, tcgdexRes] = await Promise.all([
      fetch(`${PTCG_BASE}/sets?select=id,name`, { next: { revalidate: 86400 } }),
      fetch(`${TCGDEX_BASE}/sets`, { next: { revalidate: 86400 } }),
    ]);
    if (!ptcgRes.ok || !tcgdexRes.ok) return new Map();

    const ptcgData = await ptcgRes.json();
    const tcgdexData = await tcgdexRes.json();

    const ptcgSets: Array<{ id: string; name: string }> = ptcgData.data ?? [];
    const tcgdexSets: Array<{ id: string; name: string }> = Array.isArray(tcgdexData) ? tcgdexData : [];

    // Index TCGdex sets by normalized name for fast lookup
    const tcgdexByName = new Map(
      tcgdexSets.map(s => [s.name.toLowerCase().trim(), s.id])
    );

    const map = new Map<string, string>();
    for (const { id, name } of ptcgSets) {
      const tcgdexId = tcgdexByName.get(name.toLowerCase().trim());
      if (tcgdexId && tcgdexId !== id) map.set(id, tcgdexId);
    }
    return map;
  } catch {
    return new Map();
  }
}

function mergeInto(result: Map<number, Set<string>>, cards: PtcgCard[], minDex: number, maxDex: number, setIdMap: Map<string, string>) {
  for (const card of cards) {
    const setId = setIdMap.get(card.set.id) ?? card.set.id;
    for (const dexNum of card.nationalPokedexNumbers) {
      if (dexNum < minDex || dexNum > maxDex) continue;
      const existing = result.get(dexNum);
      if (existing) existing.add(setId);
      else result.set(dexNum, new Set([setId]));
    }
  }
}

// Batch-fetch all card set memberships for dex numbers in [minDex, maxDex].
// Fetches page 1 to get total count, then remaining pages in parallel.
// Returns Map<dexId, Set<tcgdexSetId>>.
export async function fetchPtcgSetsByDexRange(
  minDex: number,
  maxDex: number,
): Promise<Map<number, Set<string>>> {
  const result = new Map<number, Set<string>>();
  const PAGE_SIZE = 250;
  const url = (page: number) =>
    `${PTCG_BASE}/cards?q=nationalPokedexNumbers:[${minDex}+TO+${maxDex}]` +
    `&select=set,nationalPokedexNumbers&pageSize=${PAGE_SIZE}&page=${page}`;

  try {
    const [firstRes, setIdMap] = await Promise.all([
      fetch(url(1), { next: { revalidate: 86400 } }),
      buildSetIdMap(),
    ]);
    if (!firstRes.ok) return result;
    const firstData = (await firstRes.json()) as PtcgResponse;
    mergeInto(result, firstData.data, minDex, maxDex, setIdMap);

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
        if (data) mergeInto(result, data.data, minDex, maxDex, setIdMap);
      }
    }
  } catch { /* return partial result */ }

  return result;
}
