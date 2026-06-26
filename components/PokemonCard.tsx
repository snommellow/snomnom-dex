"use client";

import Image from "next/image";
import { useState, useRef, useMemo, useEffect } from "react";
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
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const [sparkles, setSparkles] = useState<{ id: number; top: number; left: number }[]>([]);
  const sparkleId = useRef(0);

  useEffect(() => {
    if (!isHovered) { setSparkles([]); return; }
    const spawn = () => {
      const id = sparkleId.current++;
      setSparkles((prev) => [...prev, { id, top: Math.random() * 78 + 11, left: Math.random() * 78 + 11 }]);
      setTimeout(() => setSparkles((prev) => prev.filter((s) => s.id !== id)), 1100);
    };
    spawn();
    const t = setInterval(spawn, 900);
    return () => clearInterval(t);
  }, [isHovered]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const cx = (e.clientX - left) / width - 0.5;
    const cy = (e.clientY - top) / height - 0.5;
    setTilt({ x: cy * -18, y: cx * 18 });
    setMouse({ x: ((e.clientX - left) / width) * 100, y: ((e.clientY - top) / height) * 100 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  return (
    <article className="group cursor-pointer select-none">
      {/* Single div: perspective() inline in transform + overflow:hidden on same element — scrydex approach */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className={`relative flex flex-col overflow-hidden rounded-xl${isHovered ? " card-hovered" : ""}`}
        style={{
          border: `2.5px solid ${typeColor}`,
          backgroundColor: `${typeColor}35`,
          boxShadow: isHovered
            ? `0 16px 40px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.25)`
            : `0 4px 14px rgba(0,0,0,0.25)`,
          transform: isHovered
            ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.04)`
            : `scale(1)`,
          transition: isHovered ? "box-shadow 0.1s, transform 0.05s" : "box-shadow 0.3s, transform 0.4s ease",
          willChange: "transform",
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

        {/* ── Top blur strip — fades out during 3D tilt ── */}
        <div className="absolute left-0 right-0 z-[1] pointer-events-none" style={{
          top: 0, height: 64,
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.22) 0%, transparent 100%)",
          opacity: isHovered ? 0 : 1,
          transition: "opacity 0.2s",
        }} />

        {/* ── Bottom blur strip — fades out during 3D tilt ── */}
        <div className="absolute bottom-0 left-0 right-0 z-[5] pointer-events-none" style={{
          height: 90,
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          background: "linear-gradient(to top, rgba(255,255,255,0.22) 0%, transparent 100%)",
          opacity: isHovered ? 0 : 1,
          transition: "opacity 0.2s",
        }} />

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
        <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
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


        {/* ── Sparkle particles ── */}
        <div className="absolute inset-0 z-[11] pointer-events-none">
          {sparkles.map((s) => (
            <div
              key={s.id}
              style={{
                position: "absolute",
                top: `${s.top}%`,
                left: `${s.left}%`,
                width: 2,
                height: 2,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 0 2px 1px rgba(255,255,255,0.95), 0 0 5px 2px rgba(255,255,200,0.6)",
                animation: "sparkle 1.1s ease-in-out forwards",
                pointerEvents: "none",
              }}
            />
          ))}
        </div>

        {/* ── Holo rainbow shimmer ── */}
        <div className="absolute inset-0 z-[8] pointer-events-none rounded-xl" style={{
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.3s",
          background: `linear-gradient(${mouse.x * 1.8}deg,
            hsla(0,100%,60%,0.18) 0%,
            hsla(60,100%,60%,0.18) 16%,
            hsla(120,100%,60%,0.18) 33%,
            hsla(180,100%,60%,0.18) 50%,
            hsla(240,100%,60%,0.18) 66%,
            hsla(300,100%,60%,0.18) 83%,
            hsla(360,100%,60%,0.18) 100%)`,
          mixBlendMode: "color-dodge",
        }} />

        {/* ── Mouse glow spot ── */}
        <div className="absolute inset-0 z-[9] pointer-events-none rounded-xl" style={{
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.3s",
          background: `radial-gradient(circle at ${mouse.x}% ${mouse.y}%, rgba(255,255,255,0.28) 0%, transparent 55%)`,
          mixBlendMode: "overlay",
        }} />

        {/* ── Type pills ── */}
        <div className="relative z-10 px-2.5 py-1.5 flex flex-row flex-nowrap gap-1.5 items-center flex-shrink-0 min-h-[24px]" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
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
