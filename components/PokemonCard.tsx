"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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

  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (e.clientX - r.left) / r.width - 0.5;
    const cy = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: cy * -18, y: cx * 18 });
    setRect(r);
  }

  function handleMouseEnter() {
    setIsHovered(true);
    if (cardRef.current) setRect(cardRef.current.getBoundingClientRect());
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  return (
    <article className="group cursor-pointer select-none relative" style={{ perspective: 600 }}>
      {/* Outer: 3D transform only — no overflow:hidden so backdropFilter works */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: "relative",
          borderRadius: 12,
          boxShadow: isHovered
            ? `0 16px 40px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.25)`
            : `0 4px 14px rgba(0,0,0,0.25)`,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${isHovered ? "scale(1.04)" : "scale(1)"}`,
          transition: isHovered ? "box-shadow 0.1s, transform 0.05s" : "box-shadow 0.3s, transform 0.4s ease",
          willChange: "transform",
        }}
      >
      {/* Inner: contain:paint creates a paint boundary that clips backdropFilter */}
      <div
        className="relative flex flex-col overflow-hidden rounded-xl"
        style={{
          border: `2.5px solid ${typeColor}`,
          backgroundColor: `${typeColor}35`,
          contain: "paint",
        }}
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
            style={{ opacity: 0.55, transform: "scale(1.05) translateY(5%)", transformOrigin: "top center" }}
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
              WebkitTextStroke: "2px white",
              paintOrder: "stroke fill",
            }}
          >
            {pokemon.name}
          </p>
          {pokemon.genus && (
            <p
              className="font-semibold uppercase leading-none text-gray-500"
              style={{
                fontSize: 7,
                letterSpacing: ".1em",
                textShadow: "0 0 6px #fff, 0 0 4px #fff, 0 0 2px #fff",
              }}
            >
              The {pokemon.genus.replace(/\s*Pokémon\s*/i, "").trim()}
            </p>
          )}
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

      {/* Portal blur strips — rendered at body level so backdropFilter works with 3D tilt */}
      {mounted && rect && createPortal(
        <>
          <div style={{
            position: "fixed", pointerEvents: "none", zIndex: 9999,
            left: rect.left, top: rect.top, width: rect.width, height: 56,
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
            maskImage: "linear-gradient(to top, transparent 0%, black 70%)",
            WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 70%)",
            borderRadius: "12px 12px 0 0",
          }} />
          <div style={{
            position: "fixed", pointerEvents: "none", zIndex: 9999,
            left: rect.left, top: rect.bottom - 80, width: rect.width, height: 80,
            backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
            borderRadius: "0 0 12px 12px",
          }} />
        </>,
        document.body
      )}
      </div>

    </article>
  );
}
