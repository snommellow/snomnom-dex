"use client";

import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import { getSpriteUrl } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

interface Props {
  pokemon: PokemonSummary;
}

// Derive a richer two-stop gradient from the type hex
function typeGradient(hex: string) {
  // Lighten by blending toward white at 85 % for the top stop
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const light = `rgba(${Math.round(r + (255 - r) * 0.55)},${Math.round(g + (255 - g) * 0.55)},${Math.round(b + (255 - b) * 0.55)},1)`;
  return `linear-gradient(170deg, ${light} 0%, ${hex} 100%)`;
}

export default function PokemonCard({ pokemon }: Props) {
  const { style } = useSpriteStyle();
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  // Official artwork — transparent PNG, no card text, no frame
  const artworkUrl =
    pokemon.artworkUrl ??
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;

  // Small corner sprite driven by the settings sprite-style picker
  const spriteUrl = getSpriteUrl(pokemon.id, style);
  const pixelated = style === "gb" || style === "gen1" || style === "pixel";

  return (
    // pt-10 creates headroom above the card so the artwork can break upward
    <article className="group relative cursor-pointer select-none pt-10">

      {/* ── Card body ── */}
      <div
        className="relative rounded-xl overflow-hidden shadow-[2px_8px_20px_rgba(0,0,0,0.35)] group-hover:shadow-[4px_16px_36px_rgba(0,0,0,0.5)] transition-all duration-300"
        style={{ background: typeGradient(typeColor) }}
      >
        {/* Issue-number + POKÉDEX label — top left, small and elegant */}
        <div className="flex items-center justify-between px-3 pt-2 pb-0">
          <span
            className="font-black italic text-white/70 tracking-widest"
            style={{ fontSize: 8, letterSpacing: ".14em" }}
          >
            POKÉDEX
          </span>
          <span
            className="font-black text-white/80"
            style={{ fontSize: 9, letterSpacing: ".08em" }}
          >
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/* Spacer — artwork floats above this area (see absolute block below) */}
        <div className="h-32" />

        {/* ── Bottom info band ── */}
        <div
          className="px-3 pt-2 pb-3"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 100%)",
          }}
        >
          {/* Pokémon name — large, bold, white magazine title */}
          <h2
            className="font-black capitalize text-white leading-tight tracking-tight drop-shadow-md truncate"
            style={{ fontSize: 17 }}
          >
            {pokemon.name}
          </h2>

          {/* Tagline */}
          <p
            className="text-white/60 font-semibold uppercase mb-2"
            style={{ fontSize: 8, letterSpacing: ".1em" }}
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
                  className="inline-flex items-center overflow-hidden rounded-full text-white uppercase font-extrabold tracking-[.06em]"
                  style={{
                    backgroundColor: bg,
                    fontSize: 8,
                    padding: "2px 6px 2px 3px",
                    textShadow: "0 1px 2px rgba(0,0,0,.5)",
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

        {/* Barcode strip */}
        <div className="h-1 w-full" style={{ backgroundColor: "rgba(0,0,0,0.25)" }} />
      </div>

      {/* ── Official artwork — breaks above the card frame ── */}
      {/* Positioned absolute relative to the outer article (pt-10 gives it room) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-36 h-44 z-10 pointer-events-none"
        style={{ top: -8 }}
      >
        <Image
          src={artworkUrl}
          alt={pokemon.name}
          fill
          sizes="144px"
          className="object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)] group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* ── Sprite-style badge — bottom-right corner ── */}
      {style !== "modern" && (
        <div
          className="absolute bottom-6 right-2 w-8 h-8 z-20 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-200"
        >
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
