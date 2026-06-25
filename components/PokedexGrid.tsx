import { fetchFirst151, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgCardImages } from "@/lib/tcgapi";
import { fetchPocketImages } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();

  // Pass 1: pokemontcg.io IR/SIR full-art cards
  const tcgResults = await fetchTcgCardImages(raw.map((p) => ({ name: p.name, id: p.id })));

  // Pass 2: TCGdex Pocket star cards — only for Pokémon with no TCG card
  const missingIndexes = tcgResults
    .map((r, i) => (r.tcgUrl ? null : i))
    .filter((i): i is number => i !== null);

  const pocketMap = new Map<number, string>();
  if (missingIndexes.length) {
    const pocketResults = await fetchPocketImages(
      missingIndexes.map((i) => ({ id: raw[i].id }))
    );
    missingIndexes.forEach((rawIdx, j) => {
      if (pocketResults[j].url) pocketMap.set(rawIdx, pocketResults[j].url!);
    });
  }

  const pokemon = raw.map((p, i) =>
    toPokemonSummary(p, tcgResults[i], pocketMap.get(i) ? [pocketMap.get(i)!] : [])
  );

  return <PokedexClient pokemon={pokemon} />;
}
