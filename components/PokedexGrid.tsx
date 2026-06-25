import { fetchFirst151, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgCardImages } from "@/lib/tcgapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  // Fetch PokeAPI + TCG images in parallel at the top level
  const raw = await fetchFirst151();

  const tcgImages = await fetchTcgCardImages(
    raw.map((p) => ({ name: p.name, id: p.id }))
  );

  const pokemon = raw.map((p, i) => toPokemonSummary(p, tcgImages[i]));

  return <PokedexClient pokemon={pokemon} />;
}
