"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { UserCircle } from "lucide-react";
import type { TrainerEntry } from "@/lib/trainerapi";

// Structural 1:1 copy of PokemonCard's book-tilt rendering — same masthead/name/portrait/pill
// row dimensions, so cards are the exact same height/proportions in a mixed or side-by-side
// grid. Trainers have no type color, so a fixed accent stands in for typeColor throughout —
// per-region color for named characters, slate for generic classes that exist in every region.
const REGION_ACCENT: Record<string, string> = {
  Kanto: "#c0392b",
  Johto: "#2c6e8f",
  Hoenn: "#2f9e5c",
  Sinnoh: "#5a4fa3",
  Unova: "#4a4a52",
  Kalos: "#3aa0c9",
  Alola: "#e8873e",
  Galar: "#7b3fa0",
  Paldea: "#c23b6e",
  Hisui: "#8a6b3d",
  Lumiose: "#9b2d5e",
  "Pokémon GO": "#3a7bd5",
  Universal: "#546778",
};

interface Props {
  trainer: TrainerEntry;
  onSelect?: (trainer: TrainerEntry) => void;
}

export default function TrainerCard({ trainer, onSelect }: Props) {
  const ACCENT = REGION_ACCENT[trainer.region] ?? "#c0392b";
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
    <article
      className="group cursor-pointer select-none h-full"
      onClick={() => onSelect?.(trainer)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(trainer); } : undefined}
    >
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
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: DEPTH, transformOrigin: "left center", transform: "rotateY(-90deg)", background: `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 60%, black), ${ACCENT})` }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: DEPTH, transformOrigin: "right center", transform: "rotateY(90deg)", background: `linear-gradient(to left, color-mix(in srgb, ${ACCENT} 60%, black), ${ACCENT})` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "top center", transform: "rotateX(90deg)", background: `linear-gradient(to bottom, color-mix(in srgb, ${ACCENT} 60%, black), ${ACCENT})` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: DEPTH, transformOrigin: "bottom center", transform: "rotateX(-90deg)", background: `linear-gradient(to top, color-mix(in srgb, ${ACCENT} 60%, black), ${ACCENT})` }} />

        {/* Front face */}
        <div
          className={`relative flex flex-col overflow-hidden h-full${isHovered ? " card-hovered" : ""}`}
          style={{
            border: `4px solid ${ACCENT}`,
            backgroundColor: `${ACCENT}35`,
            transform: `translateZ(${DEPTH}px)`,
            boxShadow: isHovered ? "0 20px 40px rgba(0,0,0,0.5)" : "0 4px 14px rgba(0,0,0,0.25)",
            transition: "box-shadow 0.4s ease",
          }}
        >
          {/* Background layer 1: blurred */}
          {trainer.imageUrl && (
            <div className="absolute inset-0 z-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trainer.imageUrl} alt="" aria-hidden loading="lazy" style={{
                position: "absolute", inset: "-40px", width: "calc(100% + 80px)", height: "calc(100% + 80px)",
                objectFit: "cover", objectPosition: "center",
                opacity: 0.55, filter: "blur(25px)",
              }} />
            </div>
          )}

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
            {trainer.imageUrl && !trainer.isFullArt ? (
              /* Plain bordered card: scale up from top so only name + art fits in container,
                 hiding the rules text box — same crop as PokemonCard's regularCardUrl branch */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={trainer.imageUrl}
                alt=""
                aria-hidden
                loading="lazy"
                style={{
                  position: "absolute", top: 0, left: "50%",
                  width: "100%", height: "auto",
                  transform: "translateX(-50%) translateY(6%) scale(1.75)",
                  transformOrigin: "top center",
                  opacity: 0.8,
                }}
              />
            ) : trainer.imageUrl ? (
              <Image
                src={trainer.imageUrl}
                alt=""
                aria-hidden
                fill
                sizes="300px"
                className="object-cover object-top"
                style={{ opacity: 0.55, transform: "scale(1.05) translateY(5%)", transformOrigin: "top center" }}
                loading="lazy"
              />
            ) : null}
          </div>

          {/* Masthead */}
          <div
            className="relative z-10 flex items-center justify-between px-2.5 flex-shrink-0"
            style={{ backgroundColor: ACCENT, height: 20 }}
          >
            <span className="text-white font-black italic leading-none" style={{ fontSize: 9, letterSpacing: ".1em" }}>
              TRAINERS
            </span>
            <span className="flex items-center gap-1">
              <span className="text-white font-black tabular-nums leading-none" style={{ fontSize: 9, letterSpacing: ".06em" }}>
                {trainer.region}
              </span>
            </span>
          </div>

          {/* Name + tagline */}
          <div className="relative z-10 px-2.5 pt-1.5 pb-1 flex-shrink-0" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
            <p
              className="font-black leading-tight"
              style={{
                fontSize: trainer.name.length > 14 ? 11 : 14,
                color: ACCENT,
                WebkitTextStroke: "2px white",
                paintOrder: "stroke fill",
              }}
            >
              {trainer.name}
            </p>
            <p
              className="font-semibold leading-none text-gray-500"
              style={{ fontSize: 7, letterSpacing: ".1em", textShadow: "0 0 6px #fff, 0 0 4px #fff, 0 0 2px #fff" }}
            >
              Trainer of {trainer.region}.
            </p>
          </div>

          {/* Portrait area */}
          <div className="relative z-10 flex-1" style={{ minHeight: 120 }}>
            {!trainer.imageUrl && (
              <div className="absolute bottom-1 right-1 w-10 h-10" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
                <UserCircle size={40} strokeWidth={1} style={{ color: `${ACCENT}88` }} />
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

          {/* Region pill — same slot/dimensions as the Pokédex's type-pill row */}
          <div className="relative z-10 px-1.5 py-1.5 flex flex-row gap-1 flex-shrink-0" style={{ opacity: isHovered ? 0 : 1, transition: "opacity 0.25s" }}>
            <span
              className="flex items-center justify-center rounded-full text-white uppercase font-extrabold"
              style={{ backgroundColor: ACCENT, fontSize: 7, letterSpacing: "0.03em", padding: "3px 4px 3px 4px", width: 58, textShadow: "0 1px 2px rgba(0,0,0,.45)" }}
            >
              {trainer.region}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
