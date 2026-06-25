"use client";

import Image from "next/image";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import { getSpriteUrl } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

interface Props {
  pokemon: PokemonSummary;
}

export default function PokemonCard({ pokemon }: Props) {
  const { style } = useSpriteStyle();
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";
  const spriteUrl = getSpriteUrl(pokemon.id, style);
  const pixelated = style === "gb" || style === "gen1" || style === "pixel";

  return (
    <article className="group relative cursor-pointer select-none" style={{ perspective: "600px" }}>
      {/* Magazine cover card */}
      <div
        className="relative flex flex-col overflow-hidden rounded-sm shadow-[2px_6px_16px_rgba(0,0,0,0.4)] group-hover:shadow-[4px_14px_28px_rgba(0,0,0,0.55)] group-hover:-translate-y-2 transition-all duration-300"
        style={{ background: "#fff", border: `3px solid ${typeColor}` }}
      >
        {/* ── Masthead ── */}
        <div
          className="flex items-center justify-between px-1.5 py-0.5"
          style={{ backgroundColor: typeColor }}
        >
          {/* Publication mark — left */}
          <span
            className="text-white font-black italic leading-none"
            style={{ fontSize: 9, letterSpacing: ".04em", opacity: 0.9 }}
          >
            POKÉDEX
          </span>
          {/* Issue number — right */}
          <span
            className="text-white font-black leading-none"
            style={{ fontSize: 9, letterSpacing: ".06em" }}
          >
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/* ── Headline (Pokémon name) ── */}
        <div className="px-1.5 pt-1 pb-0.5" style={{ backgroundColor: "#fff" }}>
          <p
            className="font-black capitalize leading-tight truncate"
            style={{ fontSize: 11, color: typeColor, letterSpacing: "-.01em" }}
          >
            {pokemon.name}
          </p>
          <p
            className="font-semibold leading-none"
            style={{ fontSize: 7, color: "#999", letterSpacing: ".06em", textTransform: "uppercase" }}
          >
            The Games. The Shows.
          </p>
        </div>

        {/* ── Cover art ── */}
        <div
          className="relative mx-1 mb-1 rounded-sm overflow-hidden flex items-center justify-center"
          style={{
            background: `linear-gradient(160deg, ${typeColor}22 0%, ${typeColor}08 100%)`,
            minHeight: 88,
          }}
        >
          {/* Subtle radial behind sprite */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 70%, ${typeColor}30 0%, transparent 65%)`,
            }}
          />
          <div className="relative w-20 h-20 group-hover:scale-110 transition-transform duration-300 drop-shadow-lg z-10">
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

        {/* ── Cover lines (type pills) ── */}
        <div
          className="px-1.5 pb-1.5 pt-0.5 flex flex-col gap-0.5"
          style={{ backgroundColor: "#fff" }}
        >
          {pokemon.types.map((type) => {
            const bg = TYPE_COLOR[type] ?? "#828282";
            return (
              <span
                key={type}
                className="inline-flex items-center overflow-hidden rounded-full text-white uppercase font-extrabold tracking-[.06em]"
                style={{
                  backgroundColor: bg,
                  fontSize: 8,
                  padding: "1px 5px 1px 2px",
                  textShadow: "0 1px 2px rgba(0,0,0,.4)",
                  alignSelf: "flex-start",
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

        {/* ── Barcode strip at bottom (decorative) ── */}
        <div
          className="h-[5px] w-full"
          style={{ backgroundColor: typeColor, opacity: 0.7 }}
        />
      </div>
    </article>
  );
}
