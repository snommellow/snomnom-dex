"use client";

import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import { getSpriteUrl } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

interface Props {
  pokemon: PokemonSummary;
}

// Lighter tint for the cover background (hex → rgba at 18% opacity)
function coverBg(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.18)`;
}

export default function PokemonCard({ pokemon }: Props) {
  const { style } = useSpriteStyle();
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";
  const spriteUrl = getSpriteUrl(pokemon.id, style);
  const pixelated = style === "gb" || style === "gen1" || style === "pixel";

  return (
    <article
      className="group relative flex cursor-pointer select-none"
      style={{ perspective: "600px" }}
    >
      {/* Book wrapper — lifts and tilts on hover */}
      <div
        className="relative w-full transition-all duration-300 ease-out"
        style={{
          transformOrigin: "left center",
          transform: "rotateY(0deg)",
        }}
      >
        {/* ── Book spine (left edge) ── */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-sm z-10 shadow-md"
          style={{ backgroundColor: typeColor }}
        />

        {/* ── Book cover ── */}
        <div
          className="ml-[7px] rounded-r-md overflow-hidden flex flex-col shadow-[2px_4px_12px_rgba(0,0,0,0.35)] group-hover:shadow-[6px_12px_24px_rgba(0,0,0,0.45)] group-hover:-translate-y-2 group-hover:translate-x-1 transition-all duration-300"
          style={{ backgroundColor: coverBg(typeColor) }}
        >
          {/* Top band — series title + dex number */}
          <div
            className="flex items-center justify-between px-2 py-1"
            style={{ backgroundColor: typeColor }}
          >
            <span className="text-white/90 text-[8px] font-black uppercase tracking-[.12em] leading-none">
              Snomnom
            </span>
            <span className="text-white font-black text-[9px] leading-none">
              #{String(pokemon.id).padStart(3, "0")}
            </span>
          </div>

          {/* Artwork area */}
          <div className="relative flex-1 flex items-center justify-center py-2 px-1 min-h-[100px]">
            {/* Subtle radial glow behind sprite */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: `radial-gradient(circle at 50% 60%, ${typeColor} 0%, transparent 70%)`,
              }}
            />
            <div
              className="relative w-20 h-20 group-hover:scale-110 transition-transform duration-300 drop-shadow-lg z-10"
            >
              <Image
                src={spriteUrl}
                alt={pokemon.name}
                fill
                sizes="80px"
                className="object-contain"
                style={pixelated ? { imageRendering: "pixelated" } : undefined}
                loading="lazy"
              />
            </div>
          </div>

          {/* Bottom band — name + type pills */}
          <div className="px-2 pb-2 pt-1 flex flex-col gap-1">
            <p
              className="capitalize font-black text-[10px] leading-tight truncate"
              style={{ color: typeColor }}
            >
              {pokemon.name}
            </p>
            <div className="flex gap-1 flex-wrap">
              {pokemon.types.map((type) => {
                const bg = TYPE_COLOR[type] ?? "#828282";
                return (
                  <span
                    key={type}
                    className="inline-flex items-center overflow-hidden rounded-full text-white uppercase font-extrabold tracking-[.06em] text-[8px]"
                    style={{
                      backgroundColor: bg,
                      padding: "1px 5px 1px 2px",
                      textShadow: "0 1px 2px rgba(0,0,0,.4)",
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
      </div>
    </article>
  );
}
