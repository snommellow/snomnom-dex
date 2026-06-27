"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import type { PokemonSummary, AltForm } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const HOME_SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;

// ── Shared 3D card shell ──────────────────────────────────────────────────────

interface CardShellProps {
  typeColor: string;
  bgUrl: string;
  onBgError?: () => void;
  children: React.ReactNode;
}

function CardShell({ typeColor, bgUrl, onBgError, children }: CardShellProps) {
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
    setTilt({ x: cy * 35, y: cx * -35 });
    setMouse({ x: ((e.clientX - left) / width) * 100, y: ((e.clientY - top) / height) * 100 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  const DEPTH = 32;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: "preserve-3d",
        transform: isHovered
          ? `perspective(500px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.04)`
          : "scale(1)",
        transition: isHovered ? "transform 0.05s" : "transform 0.4s ease",
        willChange: isHovered ? "transform" : "auto",
        position: "relative",
      }}
    >
      {/* Book spine sides */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: DEPTH, transformOrigin: "left center", transform: "rotateY(-90deg)", background: `linear-gradient(to right, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: DEPTH, transformOrigin: "right center", transform: "rotateY(90deg)", background: `linear-gradient(to left, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "top center", transform: "rotateX(90deg)", background: `linear-gradient(to bottom, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "bottom center", transform: "rotateX(-90deg)", background: `linear-gradient(to top, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />

      {/* Front face */}
      <div
        className={`relative flex flex-col overflow-hidden${isHovered ? " card-hovered" : ""}`}
        style={{
          border: `4px solid ${typeColor}`,
          backgroundColor: `${typeColor}35`,
          transform: `translateZ(${DEPTH}px)`,
          boxShadow: isHovered ? "0 20px 40px rgba(0,0,0,0.5)" : "0 4px 14px rgba(0,0,0,0.25)",
          transition: "box-shadow 0.4s ease",
        }}
      >
        {/* Blurred bg */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgUrl} alt="" aria-hidden style={{
            position: "absolute", inset: "-40px", width: "calc(100% + 80px)", height: "calc(100% + 80px)",
            objectFit: "cover", objectPosition: "top center",
            opacity: 0.55, filter: "blur(25px)",
          }} />
        </div>

        {/* Sharp bg masked to middle */}
        <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none" style={{
          maskImage: isHovered
            ? "linear-gradient(black, black)"
            : "linear-gradient(to bottom, transparent 0%, transparent 10%, black 26%, black 78%, transparent 94%, transparent 100%)",
          WebkitMaskImage: isHovered
            ? "linear-gradient(black, black)"
            : "linear-gradient(to bottom, transparent 0%, transparent 10%, black 26%, black 78%, transparent 94%, transparent 100%)",
          transition: "mask-image 0.2s",
        }}>
          <Image
            src={bgUrl}
            alt=""
            aria-hidden
            fill
            sizes="300px"
            className="object-cover object-top"
            style={{ opacity: 0.55, transform: "scale(1.05) translateY(5%)", transformOrigin: "top center" }}
            loading="eager"
            onError={onBgError}
          />
        </div>

        {children}

        {/* Sparkles */}
        <div className="absolute inset-0 z-[11] pointer-events-none">
          {sparkles.map((s) => (
            <div key={s.id} style={{
              position: "absolute", top: `${s.top}%`, left: `${s.left}%`,
              width: 2, height: 2, borderRadius: "50%", background: "white",
              boxShadow: "0 0 2px 1px rgba(255,255,255,0.95), 0 0 5px 2px rgba(255,255,200,0.6)",
              animation: "sparkle 1.1s ease-in-out forwards", pointerEvents: "none",
            }} />
          ))}
        </div>

        {/* Holo shimmer */}
        <div className="absolute inset-0 z-[8] pointer-events-none rounded-xl" style={{
          opacity: isHovered ? 1 : 0, transition: "opacity 0.3s",
          background: `linear-gradient(${mouse.x * 1.8}deg,
            hsla(0,100%,60%,0.18) 0%, hsla(60,100%,60%,0.18) 16%,
            hsla(120,100%,60%,0.18) 33%, hsla(180,100%,60%,0.18) 50%,
            hsla(240,100%,60%,0.18) 66%, hsla(300,100%,60%,0.18) 83%,
            hsla(360,100%,60%,0.18) 100%)`,
          mixBlendMode: "color-dodge",
        }} />

        {/* Mouse glow */}
        <div className="absolute inset-0 z-[9] pointer-events-none rounded-xl" style={{
          opacity: isHovered ? 1 : 0, transition: "opacity 0.3s",
          background: `radial-gradient(circle at ${mouse.x}% ${mouse.y}%, rgba(255,255,255,0.28) 0%, transparent 55%)`,
          mixBlendMode: "overlay",
        }} />
      </div>
    </div>
  );
}

// ── Type pills row (shared) ───────────────────────────────────────────────────

function TypePills({ types, isHovered }: { types: string[]; isHovered?: boolean }) {
  return (
    <div className="relative z-10 px-2.5 py-1.5 flex flex-row flex-nowrap gap-1.5 items-center flex-shrink-0 min-h-[24px]"
      style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
      {types.map((type) => {
        const bg = TYPE_COLOR[type] ?? "#828282";
        return (
          <span key={type}
            className="inline-flex items-center gap-0.5 overflow-hidden rounded-full text-white uppercase font-extrabold tracking-[.06em] flex-shrink-0"
            style={{ backgroundColor: bg, fontSize: 8, padding: "2px 6px 2px 3px", textShadow: "0 1px 2px rgba(0,0,0,.45)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={typeIconUrl(type)} alt="" aria-hidden className="w-3 h-3 flex-shrink-0 object-contain" />
            {type}
          </span>
        );
      })}
    </div>
  );
}

// ── Form badge icons ──────────────────────────────────────────────────────────

function MegaStoneIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" aria-label="Mega Evolution">
      <circle cx="10" cy="10" r="9" fill="rgba(255,220,255,0.95)" stroke="rgba(180,80,220,0.8)" strokeWidth="1.5" />
      <polygon points="10,3 14,8 10,13 6,8" fill="rgba(200,80,220,0.85)" />
      <circle cx="10" cy="10" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );
}

function GmaxIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" aria-label="Gigantamax">
      <polygon points="10,1 13,7 19,8 14.5,12.5 16,19 10,16 4,19 5.5,12.5 1,8 7,7" fill="rgba(255,60,60,0.9)" stroke="rgba(180,0,0,0.7)" strokeWidth="1" />
      <text x="10" y="13.5" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="sans-serif">G</text>
    </svg>
  );
}

function RegionalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" aria-label="Regional Form">
      <circle cx="10" cy="10" r="9" fill="rgba(200,240,255,0.95)" stroke="rgba(60,140,220,0.8)" strokeWidth="1.5" />
      <ellipse cx="10" cy="10" rx="5" ry="9" fill="none" stroke="rgba(60,140,220,0.7)" strokeWidth="1.2" />
      <line x1="1" y1="10" x2="19" y2="10" stroke="rgba(60,140,220,0.7)" strokeWidth="1.2" />
    </svg>
  );
}

function FormIcon({ category }: { category: AltForm["category"] }) {
  if (category === "mega") return <MegaStoneIcon />;
  if (category === "gmax") return <GmaxIcon />;
  if (category === "regional") return <RegionalIcon />;
  return null;
}

// ── Main Pokémon card ─────────────────────────────────────────────────────────

export default function PokemonCard({ pokemon }: { pokemon: PokemonSummary }) {
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  const candidates = [...(pokemon.bgCandidates ?? []), OFFICIAL_ART(pokemon.id)];
  const [bgIndex, setBgIndex] = useState(0);
  const bgUrl = candidates[bgIndex] ?? OFFICIAL_ART(pokemon.id);

  const [isHovered, setIsHovered] = useState(false);

  return (
    <article className="group cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardShell
        typeColor={typeColor}
        bgUrl={bgUrl}
        onBgError={() => setBgIndex((i) => Math.min(i + 1, candidates.length - 1))}
      >
        {/* Masthead */}
        <div className="relative z-10 flex items-center justify-between px-2.5 py-1 flex-shrink-0"
          style={{ backgroundColor: typeColor }}>
          <span className="text-white font-black italic leading-none" style={{ fontSize: 9, letterSpacing: ".1em" }}>
            POKÉDEX
          </span>
          <span className="text-white font-black tabular-nums leading-none" style={{ fontSize: 9, letterSpacing: ".06em" }}>
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>

        {/* Name + genus */}
        <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0"
          style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
          <p className="font-black capitalize leading-tight truncate"
            style={{ fontSize: 14, color: typeColor, WebkitTextStroke: "2px white", paintOrder: "stroke fill" }}>
            {pokemon.name}
          </p>
          {pokemon.genus && (
            <p className="font-semibold uppercase leading-none text-gray-500"
              style={{ fontSize: 7, letterSpacing: ".1em", textShadow: "0 0 6px #fff, 0 0 4px #fff, 0 0 2px #fff" }}>
              The {pokemon.genus.replace(/\s*Pokémon\s*/i, "").trim()}
            </p>
          )}
        </div>

        {/* Sprite */}
        <div className="relative z-10 flex-1" style={{ minHeight: 120 }}>
          <div className="absolute bottom-1 right-1 w-10 h-10">
            <Image src={HOME_SPRITE(pokemon.id)} alt={pokemon.name} fill sizes="64px"
              className="object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]" loading="lazy" />
          </div>
        </div>

        <TypePills types={pokemon.types} isHovered={isHovered} />
      </CardShell>
    </article>
  );
}

// ── Alt form card — same design, form icon in masthead ────────────────────────

export function AltFormCard({ form, baseId }: { form: AltForm; baseId: number }) {
  const primaryType = form.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";
  const bgUrl = form.tcgUrl ?? form.artworkUrl ?? OFFICIAL_ART(baseId);

  const [isHovered, setIsHovered] = useState(false);

  return (
    <article className="group cursor-pointer select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardShell typeColor={typeColor} bgUrl={bgUrl}>
        {/* Masthead */}
        <div className="relative z-10 flex items-center justify-between px-2.5 py-1 flex-shrink-0"
          style={{ backgroundColor: typeColor }}>
          <span className="text-white font-black italic leading-none" style={{ fontSize: 9, letterSpacing: ".1em" }}>
            POKÉDEX
          </span>
          <span className="flex items-center gap-1">
            <FormIcon category={form.category} />
            <span className="text-white font-black tabular-nums leading-none" style={{ fontSize: 9, letterSpacing: ".06em" }}>
              #{String(baseId).padStart(3, "0")}
            </span>
          </span>
        </div>

        {/* Form name (no genus) */}
        <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0"
          style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
          <p className="font-black capitalize leading-tight truncate"
            style={{ fontSize: 14, color: typeColor, WebkitTextStroke: "2px white", paintOrder: "stroke fill" }}>
            {form.displayName}
          </p>
        </div>

        {/* Sprite placeholder space */}
        <div className="relative z-10 flex-1" style={{ minHeight: 120 }} />

        <TypePills types={form.types} isHovered={isHovered} />
      </CardShell>
    </article>
  );
}
