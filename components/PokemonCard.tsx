"use client";

import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import { getSpriteUrl } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

interface Props {
  pokemon: PokemonSummary;
}

// Two-stop gradient: light tint at top → full type colour at bottom
function typeGradient(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const light = `rgba(${Math.round(r + (255 - r) * 0.6)},${Math.round(g + (255 - g) * 0.6)},${Math.round(b + (255 - b) * 0.6)},1)`;
  return `linear-gradient(175deg, ${light} 0%, ${hex} 100%)`;
}

export default function PokemonCard({ pokemon }: Props) {
  const { style } = useSpriteStyle();
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  const artworkUrl =
    pokemon.artworkUrl ??
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;

  const spriteUrl = getSpriteUrl(pokemon.id, style);
  const pixelated = style === "gb" || style === "gen1" || style === "pixel";

  return (
    /*
     * pt-20 reserves 80 px of headroom ABOVE the card so the artwork
     * can float up and break out of the card's top edge freely.
     */
    <article className="group relative cursor-pointer select-none pt-20">

      {/* ── Card body ── */}
      <div
        className="relative rounded-2xl overflow-hidden
                   shadow-[0_8px_24px_rgba(0,0,0,0.3)]
                   group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.45)]
                   group-hover:-translate-y-1
                   transition-all duration-300"
        style={{ background: typeGradient(typeColor) }}
      >
        {/* Number + label strip */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
          <span
            className="font-black italic text-white/60 uppercase"
            style={{ fontSize: 8, letterSpacing: ".16em" }}
          >
            Pokédex
          </span>
          <span
            className="font-black text-white/80 tabular-nums"
            style={{ fontSize: 9, letterSpacing: ".06em" }}
          >
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/*
         * Spacer — exactly as tall as the artwork container (160 px) minus
         * the portion that breaks above the card (80 px) = 80 px.
         * This reserves the right amount of blank space for the artwork.
         */}
        <div className="h-20" />

        {/* ── Bottom info band ── */}
        <div
          className="px-3 pt-2 pb-3"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
          }}
        >
          {/* Pokémon name */}
          <h2
            className="font-black capitalize text-white leading-none tracking-tight drop-shadow truncate mb-0.5"
            style={{ fontSize: 18 }}
          >
            {pokemon.name}
          </h2>

          {/* Tagline */}
          <p
            className="text-white/55 font-semibold uppercase mb-2 leading-none"
            style={{ fontSize: 7.5, letterSpacing: ".12em" }}
          >
            The Games. The Shows.
          </p>

          {/* Type pills — single row */}
          <div className="flex flex-row flex-wrap gap-1">
            {pokemon.types.map((type) => {
              const bg = TYPE_COLOR[type] ?? "#828282";
              return (
                <span
                  key={type}
                  className="inline-flex items-center overflow-hidden rounded-full
                             text-white uppercase font-extrabold tracking-[.06em]"
                  style={{
                    backgroundColor: bg,
                    fontSize: 8,
                    padding: "2px 6px 2px 3px",
                    textShadow: "0 1px 3px rgba(0,0,0,.5)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={typeIconUrl(type)}
                    alt=""
                    aria-hidden
                    className="w-3 h-3 flex-shrink-0 mr-0.5 object-contain"
                  />
                  {type}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/*
       * ── Official artwork ──
       * w-40 h-40 (160 px square). The article has pt-20 (80 px) and this
       * is positioned at top:0 of the article, so 80 px sits above the
       * card and 80 px overlaps the card's gradient background.
       * overflow:visible on the article lets it render above the card edge.
       */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 z-10 pointer-events-none"
      >
        <Image
          src={artworkUrl}
          alt={pokemon.name}
          fill
          sizes="160px"
          className="object-contain
                     drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]
                     group-hover:scale-110
                     group-hover:-translate-y-2
                     transition-transform duration-300 ease-out"
          loading="lazy"
        />
      </div>

      {/* Sprite-style corner badge (hidden when style = modern — artwork IS the sprite) */}
      {style !== "modern" && (
        <div className="absolute bottom-7 right-2 w-8 h-8 z-20 pointer-events-none
                        opacity-70 group-hover:opacity-100 transition-opacity duration-200">
          <Image
            src={spriteUrl}
            alt=""
            aria-hidden
            fill
            sizes="32px"
            className="object-contain"
            style={pixelated ? { imageRendering: "pixelated" } : undefined}
            loading="lazy"
          />
        </div>
      )}
    </article>
  );
}
