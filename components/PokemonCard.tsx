"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import type { PokemonSummary, AltForm } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const HOME_SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";
const FORM_ICON_URL: Record<string, string> = {
  mega:     `${SPRITES}/key-stone.png`,
  gmax:     `${SPRITES}/dynamax-band.png`,
  regional: `${SPRITES}/oval-charm.png`,
};

interface Props {
  pokemon: PokemonSummary;
  formCategory?: AltForm["category"];
  formLabel?: string;
}

export default function PokemonCard({ pokemon, formCategory, formLabel }: Props) {
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  const hasSpecialCard = (pokemon.bgCandidates?.length ?? 0) > 0;
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
    setTilt({ x: cy * 35, y: cx * -35 });
    setMouse({ x: ((e.clientX - left) / width) * 100, y: ((e.clientY - top) / height) * 100 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  const DEPTH = 32;

  return (
    <article className="group cursor-pointer select-none h-full">
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
          height: "100%",
        }}
      >
        {/* Book spine sides */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: DEPTH, transformOrigin: "left center", transform: "rotateY(-90deg)", background: `linear-gradient(to right, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: DEPTH, transformOrigin: "right center", transform: "rotateY(90deg)", background: `linear-gradient(to left, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "top center", transform: "rotateX(90deg)", background: `linear-gradient(to bottom, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "bottom center", transform: "rotateX(-90deg)", background: `linear-gradient(to top, color-mix(in srgb, ${typeColor} 60%, black), ${typeColor})` }} />

        {/* Front face */}
        <div
          className={`relative flex flex-col overflow-hidden h-full${isHovered ? " card-hovered" : ""}`}
          style={{
            border: `4px solid ${typeColor}`,
            backgroundColor: `${typeColor}35`,
            transform: `translateZ(${DEPTH}px)`,
            boxShadow: isHovered ? "0 20px 40px rgba(0,0,0,0.5)" : "0 4px 14px rgba(0,0,0,0.25)",
            transition: "box-shadow 0.4s ease",
          }}
        >
          {/* Background layer 1: blurred */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={!hasSpecialCard && pokemon.regularCardUrl ? pokemon.regularCardUrl : bgUrl} alt="" aria-hidden style={{
              position: "absolute", inset: "-40px", width: "calc(100% + 80px)", height: "calc(100% + 80px)",
              objectFit: "cover", objectPosition: "center",
              opacity: 0.55, filter: "blur(25px)",
            }} />
          </div>

          {/* Background layer 2: sharp, masked */}
          <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none" style={{
            maskImage: isHovered
              ? "linear-gradient(black, black)"
              : "linear-gradient(to bottom, transparent 0%, transparent 10%, black 26%, black 78%, transparent 94%, transparent 100%)",
            WebkitMaskImage: isHovered
              ? "linear-gradient(black, black)"
              : "linear-gradient(to bottom, transparent 0%, transparent 10%, black 26%, black 78%, transparent 94%, transparent 100%)",
            transition: "mask-image 0.2s",
          }}>
            {!hasSpecialCard && pokemon.regularCardUrl ? (
              /* Regular card: scale up from top so only name + artwork fits in container */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pokemon.regularCardUrl}
                alt=""
                aria-hidden
                style={{
                  position: "absolute", top: 0, left: "50%",
                  width: "100%", height: "auto",
                  transform: "translateX(-50%) translateY(6%) scale(1.75)",
                  transformOrigin: "top center",
                  opacity: 0.8,
                }}
              />
            ) : (
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
            )}
          </div>

          {/* Masthead */}
          <div
            className="relative z-10 flex items-center justify-between px-2.5 flex-shrink-0"
            style={{ backgroundColor: typeColor, height: 20 }}
          >
            <span className="text-white font-black italic leading-none" style={{ fontSize: 9, letterSpacing: ".1em" }}>
              POKÉDEX
            </span>
            <span className="flex items-center gap-1">
              {formCategory && FORM_ICON_URL[formCategory] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={FORM_ICON_URL[formCategory]}
                  alt={formCategory}
                  style={{ width: 9, height: 9, objectFit: "contain", imageRendering: "pixelated" }}
                />
              )}
              <span className="text-white font-black tabular-nums leading-none" style={{ fontSize: 9, letterSpacing: ".06em" }}>
                #{String(pokemon.id).padStart(3, "0")}
              </span>
            </span>
          </div>

          {/* Name + tagline */}
          <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
            <p
              className="font-black capitalize leading-tight truncate"
              style={{ fontSize: 14, color: typeColor, WebkitTextStroke: "2px white", paintOrder: "stroke fill" }}
            >
              {pokemon.name}
            </p>
            {(pokemon.genus || formLabel) && (
              <p
                className="font-semibold leading-none text-gray-500"
                style={{ fontSize: 7, letterSpacing: ".1em", textShadow: "0 0 6px #fff, 0 0 4px #fff, 0 0 2px #fff" }}
              >
                {pokemon.genus
                  ? `The ${pokemon.genus.replace(/\s*Pokémon\s*/i, "").trim()}.${formLabel ? ` The ${formLabel}.` : ""}`
                  : formLabel ? `The ${formLabel}.` : ""}
              </p>
            )}
          </div>

          {/* Sprite area */}
          <div className="relative z-10 flex-1" style={{ minHeight: 120 }}>
            {!formCategory ? (
              <div className="absolute bottom-1 right-1 w-10 h-10" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
                <Image
                  src={HOME_SPRITE(pokemon.id)}
                  alt={pokemon.name}
                  fill
                  sizes="64px"
                  className="object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="absolute bottom-1 right-1 w-10 h-10" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
                <Image
                  src={HOME_SPRITE(pokemon.id)}
                  alt={pokemon.name}
                  fill
                  sizes="64px"
                  className="object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]"
                  loading="lazy"
                />
              </div>
            )}
          </div>

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

          {/* Type pills */}
          <div className="relative z-10 px-2.5 py-1.5 flex flex-row gap-1.5 flex-shrink-0" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
            {pokemon.types.map((type) => {
              const bg = TYPE_COLOR[type] ?? "#828282";
              return (
                <span
                  key={type}
                  className="flex items-center rounded-full text-white uppercase font-extrabold"
                  style={{ backgroundColor: bg, fontSize: 8, letterSpacing: "0.04em", padding: "3px 6px 3px 5px", width: 68, textShadow: "0 1px 2px rgba(0,0,0,.45)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={typeIconUrl(type)} alt="" aria-hidden className="w-3 h-3 flex-shrink-0 object-contain" />
                  <span style={{ flex: 1, textAlign: "center" }}>{type}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}


const FORM_PREFIXES = ["Gigantamax ", "Alolan ", "Galarian ", "Hisuian ", "Paldean ", "Mega "] as const;

function extractAltFormParts(displayName: string, category: AltForm["category"]): { baseName: string; formLabel: string } {
  let baseName = displayName;
  for (const prefix of FORM_PREFIXES) {
    if (baseName.startsWith(prefix)) { baseName = baseName.slice(prefix.length); break; }
  }
  if (category === "mega") baseName = baseName.replace(/ [XY]$/, "");

  let label = "";
  if (category === "mega") {
    label = displayName.endsWith(" X") ? "Mega X" : displayName.endsWith(" Y") ? "Mega Y" : "Mega";
  } else if (category === "gmax") {
    label = "Gigantamax";
  } else if (category === "regional") {
    if (displayName.startsWith("Alolan")) label = "Alolan";
    else if (displayName.startsWith("Galarian")) label = "Galarian";
    else if (displayName.startsWith("Hisuian")) label = "Hisuian";
    else if (displayName.startsWith("Paldean")) label = "Paldean";
  }
  return { baseName, formLabel: label };
}

// Alt form card: converts AltForm data into a PokemonSummary and renders the exact same PokemonCard
export function AltFormCard({ form, baseId, genus }: { form: AltForm; baseId: number; genus?: string | null }) {
  const { baseName, formLabel } = extractAltFormParts(form.displayName, form.category);
  const summary: PokemonSummary = {
    id: baseId,
    name: baseName,
    types: form.types,
    spriteUrl: null,
    artworkUrl: form.artworkUrl,
    genus: genus ?? null,
    bgCandidates: form.regularCardUrl
      ? []
      : [form.tcgUrl, form.artworkUrl].filter((u): u is string => !!u),
    regularCardUrl: form.regularCardUrl ?? undefined,
    altForms: [],
  };
  return <PokemonCard pokemon={summary} formCategory={form.category} formLabel={formLabel} />;
}
