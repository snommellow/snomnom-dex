import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_BADGE, TYPE_GRADIENT } from "@/lib/typeColors";

interface Props {
  pokemon: PokemonSummary;
}

export default function PokemonCard({ pokemon }: Props) {
  const primaryType = pokemon.types[0] ?? "normal";
  const imageUrl = pokemon.artworkUrl ?? pokemon.spriteUrl;
  const gradient = TYPE_GRADIENT[primaryType] ?? "from-gray-100 to-white";

  return (
    <article
      className={`group relative flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b ${gradient} p-4 pt-5 ring-1 ring-black/5 shadow-sm hover:shadow-lg hover:-translate-y-1.5 transition-all duration-200 cursor-pointer select-none`}
    >
      {/* Pokédex number */}
      <span className="absolute top-2.5 left-3 text-[10px] font-mono font-bold text-black/30 tracking-widest">
        #{String(pokemon.id).padStart(3, "0")}
      </span>

      {/* Sprite */}
      <div className="relative w-28 h-28 mt-1 drop-shadow-md group-hover:scale-110 transition-transform duration-200">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={pokemon.name}
            fill
            sizes="112px"
            className="object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-black/20">?</div>
        )}
      </div>

      {/* Name */}
      <p className="capitalize font-bold text-gray-800 text-sm tracking-wide leading-none">
        {pokemon.name}
      </p>

      {/* Type badges */}
      <div className="flex flex-wrap justify-center gap-1">
        {pokemon.types.map((type) => (
          <span
            key={type}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ring-1 ${TYPE_BADGE[type] ?? "bg-gray-200 text-gray-700 ring-gray-300"}`}
          >
            {type}
          </span>
        ))}
      </div>
    </article>
  );
}
