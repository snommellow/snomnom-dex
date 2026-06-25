"use client";

import Image from "next/image";
import { useState } from "react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";

interface Props {
  pokemon: PokemonSummary;
}

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const HOME_SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;

export default function PokemonCard({ pokemon }: Props) {
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  const candidates = [...(pokemon.bgCandidates ?? []), OFFICIAL_ART(pokemon.id)];
  const [bgIndex, setBgIndex] = useState(0);
  const bgUrl = candidates[bgIndex] ?? OFFICIAL_ART(pokemon.id);

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
        {/* ── Background: IR/SIR full-art or official artwork fallback ── */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <Image
            src={bgUrl}
            alt=""
            aria-hidden
            fill
            sizes="300px"
            className="object-cover object-top"
            style={{ opacity: 0.55, transform: "scale(1.3)", transformOrigin: "top center" }}
            loading="eager"
            onError={() => setBgIndex((i) => Math.min(i + 1, candidates.length - 1))}
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
            style={{
              fontSize: 14,
              color: typeColor,
              filter: "brightness(0.7)",
              textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
            }}
          >
            {pokemon.name}
          </p>
          <p
            className="font-semibold uppercase leading-none text-gray-500"
            style={{
              fontSize: 7,
              letterSpacing: ".1em",
              textShadow: "-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff",
            }}
          >
            The Games. The Shows.
          </p>
        </div>

        {/* ── Sprite area ── */}
        <div className="relative z-10 flex-1" style={{ minHeight: 120 }}>
          <div className="absolute bottom-1 right-1 w-10 h-10">
            <Image
              src={HOME_SPRITE(pokemon.id)}
              alt={pokemon.name}
              fill
              sizes="64px"
              className="object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]"
              loading="lazy"
            />
          </div>
        </div>

        {/* ── Bottom blur strip — fades in smoothly from mid-card ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-[5] pointer-events-none"
          style={{
            height: 80,
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
          }}
        />

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
