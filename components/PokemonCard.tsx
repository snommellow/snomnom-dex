import Image from "next/image";
import type { Pokemon } from "@/lib/pokeapi";
import { TYPE_COLORS, TYPE_BG } from "@/lib/typeColors";

interface Props {
  pokemon: Pokemon;
}

export default function PokemonCard({ pokemon }: Props) {
  const primaryType = pokemon.types[0]?.type.name ?? "normal";
  const spriteUrl =
    pokemon.sprites.other["official-artwork"].front_default ??
    pokemon.sprites.front_default;

  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-br ${TYPE_BG[primaryType] ?? "from-gray-200 to-gray-50"} p-4 flex flex-col items-center gap-2 shadow hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer`}
    >
      <span className="absolute top-2 right-3 text-xs font-mono text-gray-500 font-semibold">
        #{String(pokemon.id).padStart(3, "0")}
      </span>

      <div className="relative w-24 h-24">
        {spriteUrl ? (
          <Image
            src={spriteUrl}
            alt={pokemon.name}
            fill
            sizes="96px"
            className="object-contain drop-shadow-md"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">?</div>
        )}
      </div>

      <p className="capitalize font-semibold text-gray-800 text-sm tracking-wide">
        {pokemon.name}
      </p>

      <div className="flex gap-1 flex-wrap justify-center">
        {pokemon.types.map(({ type }) => (
          <span
            key={type.name}
            className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${TYPE_COLORS[type.name] ?? "bg-gray-400 text-white"}`}
          >
            {type.name}
          </span>
        ))}
      </div>
    </div>
  );
}
