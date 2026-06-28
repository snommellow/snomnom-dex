// Given a map of "sets per dex ID" and a chain map (dex ID → full chain members),
// returns preferred chain sets per dex ID — sets where ALL chain members present
// in the batch have at least one candidate card.
export function buildChainSets(
  setsByDex: Map<number, Set<string>>,
  chainsByDex: Map<number, number[]>,
): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  const processed = new Set<string>();

  for (const [, fullChain] of chainsByDex) {
    // Only consider members that have at least one candidate card in this pass
    const chain = fullChain.filter(id => (setsByDex.get(id)?.size ?? 0) > 0);
    if (chain.length < 2) continue;
    const key = [...chain].sort((a, b) => a - b).join(",");
    if (processed.has(key)) continue;
    processed.add(key);

    const memberSets = chain.map(id => setsByDex.get(id)!);
    const common = new Set(memberSets[0]);
    for (const s of memberSets.slice(1)) {
      for (const setId of [...common]) if (!s.has(setId)) common.delete(setId);
    }
    if (!common.size) continue;

    for (const id of chain) {
      const ex = result.get(id);
      if (ex) { for (const s of common) ex.add(s); }
      else result.set(id, new Set(common));
    }
  }
  return result;
}
