import { fetchFirst151, toPokemonSummary } from "@/lib/pokeapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();
  const pokemon = raw.map(toPokemonSummary);
  return <PokedexClient pokemon={pokemon} />;
}
