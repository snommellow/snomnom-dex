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
  const hasTcg = !!pokemon.tcgImageUrl;

  return (
    <article
      className="group relative cursor-pointer select-none"
      style={{ perspective: "600px" }}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-sm shadow-[2px_6px_16px_rgba(0,0,0,0.4)] group-hover:shadow-[4px_14px_32px_rgba(0,0,0,0.6)] group-hover:-translate-y-2 transition-all duration-300"
        style={{ background: "#fff", border: `3px solid ${typeColor}` }}
      >
        {/* ── Masthead ── */}
        <div
          className="flex items-center justify-between px-2 py-1 flex-shrink-0"
          style={{ backgroundColor: typeColor }}
        >
          <span
            className="text-white font-black italic leading-none"
            style={{ fontSize: 11, letterSpacing: ".04em", opacity: 0.9 }}
          >
            POKÉDEX
          </span>
          <span
            className="text-white font-black leading-none"
            style={{ fontSize: 11, letterSpacing: ".06em" }}
          >
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/* ── Headline ── */}
        <div className="px-2 pt-1.5 pb-1 flex-shrink-0" style={{ backgroundColor: "#fff" }}>
          <p
            className="font-black capitalize leading-tight truncate"
            style={{ fontSize: 15, color: typeColor, letterSpacing: "-.01em" }}
          >
            {pokemon.name}
          </p>
          <p
            className="font-semibold leading-none mt-0.5"
            style={{ fontSize: 9, color: "#aaa", letterSpacing: ".06em", textTransform: "uppercase" }}
          >
            The Games. The Shows.
          </p>
        </div>

        {/* ── Artwork area ── */}
        <div
          className="relative mx-1.5 mb-1 overflow-hidden flex items-center justify-center"
          style={{ minHeight: 148, borderRadius: 2 }}
        >
          {hasTcg ? (
            <>
              {/* TCG card fills the frame, cropped to show the art zone (top ~55%) */}
              <Image
                src={pokemon.tcgImageUrl!}
                alt={`${pokemon.name} TCG card`}
                fill
                sizes="200px"
                className="object-cover object-top scale-[1.08] group-hover:scale-[1.14] transition-transform duration-500"
                loading="lazy"
              />
              {/* Dark gradient at bottom so text/pills stay readable */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.55) 100%)",
                }}
              />
              {/* Sprite overlaid — small, top-right corner */}
              <div
                className="absolute top-1 right-1 w-10 h-10 group-hover:scale-110 transition-transform duration-300 drop-shadow-lg z-10"
              >
                <Image
                  src={spriteUrl}
                  alt={pokemon.name}
                  fill
                  sizes="40px"
                  className="object-contain"
                  style={pixelated ? { imageRendering: "pixelated" } : undefined}
                  loading="lazy"
                />
              </div>
            </>
          ) : (
            <>
              {/* Fallback: type-colour gradient + centred sprite */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(160deg, ${typeColor}33 0%, ${typeColor}0d 100%)`,
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at 50% 70%, ${typeColor}44 0%, transparent 65%)`,
                }}
              />
              <div className="relative w-32 h-32 group-hover:scale-110 transition-transform duration-300 drop-shadow-lg z-10">
                <Image
                  src={spriteUrl}
                  alt={pokemon.name}
                  fill
                  sizes="128px"
                  className="object-contain"
                  style={pixelated ? { imageRendering: "pixelated" } : undefined}
                  loading="lazy"
                />
              </div>
            </>
          )}
        </div>

        {/* ── Type pills — single row ── */}
        <div
          className="px-2 pb-2 pt-1 flex flex-row flex-wrap gap-1 flex-shrink-0"
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
                  padding: "2px 6px 2px 3px",
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

        {/* ── Barcode strip ── */}
        <div
          className="h-[5px] w-full flex-shrink-0"
          style={{ backgroundColor: typeColor, opacity: 0.7 }}
        />
      </div>
    </article>
  );
}
