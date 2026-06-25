import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, TYPE_GRADIENT, typeIconUrl } from "@/lib/typeColors";

interface Props {
  pokemon: PokemonSummary;
}

export default function PokemonCard({ pokemon }: Props) {
  const primaryType = pokemon.types[0] ?? "normal";
  const gradient = TYPE_GRADIENT[primaryType] ?? "from-gray-100 to-white";

  // Pixel sprite — same source as reference (raw GitHub PokeAPI sprites)
  const spriteUrl =
    pokemon.spriteUrl ??
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;

  return (
    <article
      className={`group relative flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b ${gradient} p-4 pt-5 ring-1 ring-black/5 shadow-sm hover:shadow-lg hover:-translate-y-1.5 transition-all duration-200 cursor-pointer select-none`}
    >
      {/* Pokédex number */}
      <span className="absolute top-2.5 left-3 text-[10px] font-mono font-bold text-black/30 tracking-widest">
        #{String(pokemon.id).padStart(3, "0")}
      </span>

      {/* Pixel sprite — rounded rect with inner padding, pixelated rendering */}
      <div className="relative w-24 h-24 mt-1 rounded-xl bg-white/60 p-1 group-hover:scale-110 transition-transform duration-200 shadow-sm">
        <Image
          src={spriteUrl}
          alt={pokemon.name}
          fill
          sizes="96px"
          className="object-contain"
          style={{ imageRendering: "pixelated" }}
          loading="lazy"
        />
      </div>

      {/* Name */}
      <p className="capitalize font-bold text-gray-800 text-sm tracking-wide leading-none">
        {pokemon.name}
      </p>

      {/* Type pills — solid colour, SVG icon + uppercase white label, fixed 75 px width */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {pokemon.types.map((type) => {
          const bg = TYPE_COLOR[type] ?? "#828282";
          return (
            <span
              key={type}
              className="inline-flex items-center rounded-full text-white uppercase font-extrabold tracking-[.06em] text-[9px]"
              style={{
                backgroundColor: bg,
                width: 75,
                padding: "2px 4px 2px 2px",
                textShadow: "0 1px 2px rgba(0,0,0,.35)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typeIconUrl(type)}
                alt=""
                aria-hidden
                width={16}
                height={16}
                className="flex-shrink-0 mr-1"
              />
              <span className="flex-1 text-center">{type}</span>
            </span>
          );
        })}
      </div>
    </article>
  );
}
