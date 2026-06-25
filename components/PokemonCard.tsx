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
          {/* Type-colour base layer always present */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, ${typeColor}55 0%, ${typeColor}22 100%)`,
            }}
          />

          {hasTcg && (
            /* TCG art cropped window — zoomed in on art zone only (top ~48%
               of the card) so frame border and attack text are never visible */
            <div className="absolute inset-0 overflow-hidden">
              <Image
                src={pokemon.tcgImageUrl!}
                alt=""
                aria-hidden
                fill
                sizes="200px"
                className="object-cover object-top opacity-50 scale-[2.0] origin-top group-hover:scale-[2.1] transition-transform duration-500"
                loading="lazy"
              />
            </div>
          )}

          {/* Vignette — fades edges so sprite reads cleanly on top */}
          <div
            className="absolute inset-0 z-10"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.18) 100%)",
            }}
          />

          {/* Sprite — always centred, always on top */}
          <div className="relative w-28 h-28 group-hover:scale-110 transition-transform duration-300 drop-shadow-xl z-20">
            <Image
              src={spriteUrl}
              alt={pokemon.name}
              fill
              sizes="112px"
              className="object-contain"
              style={pixelated ? { imageRendering: "pixelated" } : undefined}
              loading="lazy"
            />
          </div>
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
