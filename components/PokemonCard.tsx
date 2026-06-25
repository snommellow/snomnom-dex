"use client";

import Image from "next/image";
import { useState } from "react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";
import { getSpriteUrl } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

interface Props {
  pokemon: PokemonSummary;
}

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

// Parse set ID and card number from a pokemontcg.io image URL.
// e.g. "https://images.pokemontcg.io/sv3pt5/182.png" → { setId:"sv3pt5", number:"182" }
function parseTcgUrl(url: string | null): { setId: string; number: string } | null {
  if (!url) return null;
  const m = url.match(/images\.pokemontcg\.io\/([^/]+)\/(\d+)/);
  return m ? { setId: m[1], number: m[2] } : null;
}

// ── Background asset cascade ──────────────────────────────────────────────────
function bgCandidates(pokemon: { id: number; tcgImageUrl: string | null }): string[] {
  const tcg = parseTcgUrl(pokemon.tcgImageUrl);
  const pad = String(pokemon.id).padStart(3, "0");
  return [
    // Tier 1a — PokéOS TCG Pocket, national dex padded (most likely to work)
    `https://www.pokeos.com/img/tcg/pocket/${pad}.png`,
    // Tier 1b — PokéOS TCG Pocket with _textless suffix
    `https://www.pokeos.com/img/tcg/pocket/cards/${pad}_textless.png`,
    // Tier 1c — PokéOS TCG Pocket using standard TCG setId-number (less likely to match)
    ...(tcg ? [`https://www.pokeos.com/img/tcg/pocket/cards/${tcg.setId}-${tcg.number}_textless.png`] : []),
    // Tier 2 — pokemontcg.io SIR/IR scan; object-top CSS pans the text box out of view
    ...(pokemon.tcgImageUrl ? [pokemon.tcgImageUrl] : []),
    // Tier 3 — official PokeAPI artwork (guaranteed for all 151)
    OFFICIAL_ART(pokemon.id),
  ];
}

export default function PokemonCard({ pokemon }: Props) {
  const { style } = useSpriteStyle();
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  const artworkUrl = pokemon.artworkUrl ?? OFFICIAL_ART(pokemon.id);

  const candidates = bgCandidates(pokemon);
  const [bgIndex, setBgIndex] = useState(0);
  const bgUrl = candidates[bgIndex] ?? OFFICIAL_ART(pokemon.id);

  const spriteUrl = getSpriteUrl(pokemon.id, style);
  const pixelated = style === "gb" || style === "gen1" || style === "pixel";
  const showSprite = style !== "modern";

  return (
    <article className="group cursor-pointer select-none">
      <div
        className="relative flex flex-col overflow-hidden rounded-xl
                   shadow-[0_4px_14px_rgba(0,0,0,0.25)]
                   hover:shadow-[0_8px_24px_rgba(0,0,0,0.38)]
                   hover:-translate-y-1
                   transition-all duration-200"
        style={{ border: `2.5px solid ${typeColor}`, backgroundColor: `${typeColor}35` }}
      >
        {/* ── Background: official artwork, covers full card, faded ── */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image
            src={bgUrl}
            alt=""
            aria-hidden
            fill
            sizes="300px"
            className="object-cover opacity-25 object-top"
            loading="lazy"
            onError={(e) => {
              console.error("Card bg failed to load:", e.currentTarget.src);
              setBgIndex((i) => Math.min(i + 1, candidates.length - 1));
            }}
          />
        </div>

        {/* ── Masthead strip ── */}
        <div
          className="relative z-10 flex items-center justify-between px-2.5 py-1 flex-shrink-0"
          style={{ backgroundColor: typeColor }}
        >
          <span
            className="text-white font-black italic leading-none"
            style={{ fontSize: 9, letterSpacing: ".1em" }}
          >
            POKÉDEX
          </span>
          <span
            className="text-white font-black tabular-nums leading-none"
            style={{ fontSize: 9, letterSpacing: ".06em" }}
          >
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/* ── Name + tagline ── */}
        <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0">
          <p
            className="font-black capitalize leading-tight truncate"
            style={{ fontSize: 14, color: typeColor, filter: "brightness(0.7)" }}
          >
            {pokemon.name}
          </p>
          <p
            className="font-semibold uppercase leading-none text-gray-500"
            style={{ fontSize: 7, letterSpacing: ".1em" }}
          >
            The Games. The Shows.
          </p>
        </div>

        {/* ── Artwork area ── */}
        <div
          className="relative z-10 mx-1.5 overflow-hidden flex-shrink-0"
          style={{
            height: 148,
            borderRadius: 6,
            background: `radial-gradient(ellipse at 50% 60%, ${typeColor}55 0%, transparent 72%)`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative w-32 h-32
                          group-hover:scale-110 group-hover:-translate-y-1
                          transition-transform duration-300 ease-out
                          drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
            >
              <Image
                src={artworkUrl}
                alt={pokemon.name}
                fill
                sizes="128px"
                className="object-contain"
                loading="lazy"
              />
            </div>
          </div>

          {showSprite && (
            <div
              className="absolute bottom-1 right-1 w-8 h-8 z-10
                          opacity-70 group-hover:opacity-100
                          transition-opacity duration-200"
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
        </div>

        {/* ── Type pills ── */}
        <div className="relative z-10 px-2.5 py-1.5 flex flex-row flex-nowrap gap-1.5 items-center flex-shrink-0 min-h-[24px]">
          {pokemon.types.map((type) => {
            const bg = TYPE_COLOR[type] ?? "#828282";
            return (
              <span
                key={type}
                className="inline-flex items-center gap-0.5 overflow-hidden rounded-full
                           text-white uppercase font-extrabold tracking-[.06em] flex-shrink-0"
                style={{
                  backgroundColor: bg,
                  fontSize: 8,
                  padding: "2px 6px 2px 3px",
                  textShadow: "0 1px 2px rgba(0,0,0,.45)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={typeIconUrl(type)}
                  alt=""
                  aria-hidden
                  className="w-3 h-3 flex-shrink-0 object-contain"
                />
                {type}
              </span>
            );
          })}
        </div>
      </div>
    </article>
  );
}
