import { fetchFirst151, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgCardImages, getPocketStarUrl } from "@/lib/tcgapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();
  const tcgUrls = await fetchTcgCardImages(raw.map((p) => ({ name: p.name, id: p.id })));
  const pokemon = raw.map((p, i) =>
    toPokemonSummary(p, tcgUrls[i] ?? null, getPocketStarUrl(p.id))
  );
  return <PokedexClient pokemon={pokemon} />;
}
