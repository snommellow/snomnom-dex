"use client";

import { useEffect, useState } from "react";
import { X, Volume2 } from "lucide-react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const STAT_MAX = 255;

function formatName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PokemonDetailModal({
  pokemon,
  formLabel,
  onClose,
}: {
  pokemon: PokemonSummary;
  formLabel?: string;
  onClose: () => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      window.speechSynthesis?.cancel();
    };
  }, [onClose]);

  function speak() {
    if (!pokemon.flavorText || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(pokemon.flavorText);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{ background: `linear-gradient(160deg, ${typeColor}, color-mix(in srgb, ${typeColor} 60%, black))` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Artwork */}
        <div className="flex flex-col items-center pt-8 pb-2 px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pokemon.artworkUrl ?? OFFICIAL_ART(pokemon.id)}
            alt={pokemon.name}
            className="w-40 h-40 object-contain drop-shadow-xl"
          />
          <h2 className="text-white text-2xl font-black uppercase tracking-wide text-center drop-shadow mt-1">
            {formatName(pokemon.name)}
          </h2>
          {formLabel && (
            <p className="text-white/70 text-xs font-semibold mt-0.5">{formLabel}</p>
          )}
          <div className="flex gap-2 mt-2">
            {pokemon.types.map((type) => {
              const bg = TYPE_COLOR[type] ?? "#828282";
              return (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white uppercase font-extrabold tracking-wide text-[11px]"
                  style={{ backgroundColor: bg, textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={typeIconUrl(type)} alt="" aria-hidden className="w-3.5 h-3.5 object-contain" />
                  {type}
                </span>
              );
            })}
          </div>
        </div>

        {/* Flavor text */}
        {pokemon.flavorText && (
          <div className="mx-4 mb-3 relative rounded-2xl border border-white/25 bg-black/15 px-4 py-3">
            <p className="text-white text-sm leading-snug pr-8">{pokemon.flavorText}</p>
            <button
              onClick={speak}
              disabled={speaking}
              className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-gray-800 flex items-center justify-center shadow disabled:opacity-60"
              aria-label="Read description aloud"
              title="Read aloud"
            >
              <Volume2 size={16} />
            </button>
          </div>
        )}

        {/* Info panel */}
        <div className="bg-white/95 rounded-t-3xl px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Dex No.</p>
              <p className="text-sm font-black text-gray-800">#{String(pokemon.id).padStart(3, "0")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Height</p>
              <p className="text-sm font-black text-gray-800">{pokemon.heightM != null ? `${pokemon.heightM.toFixed(1)} m` : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Weight</p>
              <p className="text-sm font-black text-gray-800">{pokemon.weightKg != null ? `${pokemon.weightKg.toFixed(1)} kg` : "—"}</p>
            </div>
          </div>

          {pokemon.genus && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Classification</p>
              <p className="text-sm font-semibold text-gray-800">{pokemon.genus}</p>
            </div>
          )}

          {pokemon.abilities && pokemon.abilities.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Abilities</p>
              <div className="flex flex-col gap-1.5">
                {pokemon.abilities.map((a) => (
                  <div key={a.name} className="text-sm">
                    <span className="font-bold text-gray-800">{formatName(a.name)}</span>
                    {a.isHidden && <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">(Hidden)</span>}
                    {a.effect && <p className="text-xs text-gray-500 leading-snug">{a.effect}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pokemon.stats && pokemon.stats.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Base Stats</p>
              <div className="flex flex-col gap-1.5">
                {pokemon.stats.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-bold text-gray-600 flex-shrink-0">{s.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (s.value / STAT_MAX) * 100)}%`,
                          backgroundColor: typeColor,
                        }}
                      />
                    </div>
                    <span className="w-8 text-xs font-black text-gray-800 text-right flex-shrink-0">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
