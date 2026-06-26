import { fetchFirst151, fetchGenus, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgVgx } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketFallback } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();
  const ids = raw.map((p) => p.id);

  // Pass 1: IR/SIR — best quality full-art illustration cards
  const irMap = await fetchTcgIrSir(ids);

  // Pass 2: TCG Pocket star cards — for Pokémon missing IR/SIR
  const afterIr = ids.filter((id) => !irMap.has(id));
  const pocketResultsList = afterIr.length
    ? await fetchPocketImages(afterIr.map((id) => {
        const p = raw.find((r) => r.id === id)!;
        return { id, name: p.name };
      }))
    : [];
  const pocketMap = new Map<number, string>();
  afterIr.forEach((id, j) => {
    if (pocketResultsList[j]?.url) pocketMap.set(id, pocketResultsList[j].url!);
  });

  // Pass 3: V/GX/EX — for Pokémon still missing after IR/SIR + Pocket
  const afterPocket = afterIr.filter((id) => !pocketMap.has(id));
  const vgxMap = await fetchTcgVgx(afterPocket);

  // Pass 4: any Pocket card (including commons) for Pokémon still without a card
  const afterVgx = afterPocket.filter((id) => !vgxMap.has(id));
  const fallbackList = afterVgx.length
    ? await fetchPocketFallback(afterVgx.map((id) => {
        const p = raw.find((r) => r.id === id)!;
        return { id, name: p.name };
      }))
    : [];
  const fallbackMap = new Map<number, string>();
  afterVgx.forEach((id, j) => {
    if (fallbackList[j]?.url) fallbackMap.set(id, fallbackList[j].url!);
  });

  const genera = await Promise.all(raw.map((p) => fetchGenus(p.id)));

  const pokemon = raw.map((p) => {
    const tcgResult = irMap.get(p.id) ?? vgxMap.get(p.id) ?? { tcgUrl: null };
    const pocketUrl = pocketMap.get(p.id) ?? fallbackMap.get(p.id);
    return toPokemonSummary(p, tcgResult, pocketUrl ? [pocketUrl] : [], genera[ids.indexOf(p.id)]);
  });

  return <PokedexClient pokemon={pokemon} />;
}
