import { fetchFirst151 } from "@/lib/pokeapi";
import PokemonCard from "./PokemonCard";

export default async function PokedexGrid() {
  const pokemon = await fetchFirst151();

  return (
    <section>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {pokemon.map((p) => (
          <PokemonCard key={p.id} pokemon={p} />
        ))}
      </div>
    </section>
  );
}
