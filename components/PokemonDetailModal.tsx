"use client";

import { useEffect, useState } from "react";
import {
  X, Volume2, BookOpen, BarChart3, Sparkles, Layers, Egg, Swords, GitBranch, type LucideIcon,
} from "lucide-react";
import type { PokemonSummary } from "@/lib/pokeapi";
import { TYPE_COLOR, typeIconUrl } from "@/lib/typeColors";

const OFFICIAL_ART = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const HOME_SPRITE = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;

const STAT_MAX = 255;

function formatName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type TabKey = "bio" | "stats" | "abilities" | "forms" | "eggGroups" | "moves" | "evolution";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "bio", label: "Bio", icon: BookOpen },
  { key: "stats", label: "Stats", icon: BarChart3 },
  { key: "abilities", label: "Abilities", icon: Sparkles },
  { key: "forms", label: "Alt Form", icon: Layers },
  { key: "eggGroups", label: "Egg Group", icon: Egg },
  { key: "moves", label: "Moves", icon: Swords },
  { key: "evolution", label: "Evolution", icon: GitBranch },
];

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
  const [tab, setTab] = useState<TabKey>("bio");
  const [opened, setOpened] = useState(false);
  const primaryType = pokemon.types[0] ?? "normal";
  const typeColor = TYPE_COLOR[primaryType] ?? "#828282";

  useEffect(() => {
    // Kick the "cover opens" animation on mount.
    const t = setTimeout(() => setOpened(true), 30);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
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

  const availableTabs = TABS.filter(({ key }) => {
    if (key === "forms") return (pokemon.altForms?.length ?? 0) > 0;
    if (key === "eggGroups") return (pokemon.eggGroups?.length ?? 0) > 0;
    if (key === "moves") return (pokemon.levelUpMoves?.length ?? 0) > 0;
    if (key === "evolution") return (pokemon.evolutionSteps?.length ?? 0) > 1;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col sm:flex-row rounded-2xl shadow-2xl overflow-hidden"
        style={{
          transform: opened ? "perspective(1400px) rotateY(0deg) scale(1)" : "perspective(1400px) rotateY(-25deg) scale(0.92)",
          opacity: opened ? 1 : 0,
          transition: "transform 0.45s cubic-bezier(.2,.8,.2,1), opacity 0.3s ease",
          transformOrigin: "left center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 text-white flex items-center justify-center transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Left page — fixed cover, never changes with tabs */}
        <div
          className="flex flex-col items-center flex-shrink-0 w-full sm:w-64 px-6 pt-8 pb-6"
          style={{ background: `linear-gradient(160deg, ${typeColor}, color-mix(in srgb, ${typeColor} 55%, black))` }}
        >
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
            <p className="text-white/70 text-xs font-semibold mt-0.5 text-center">{formLabel}</p>
          )}
          <p className="text-white/60 text-xs font-bold mt-1">#{String(pokemon.id).padStart(3, "0")}</p>
          <div className="flex gap-2 mt-3">
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

        {/* Right page — bookmark tabs + swappable content */}
        <div className="relative flex-1 min-h-0 flex bg-white/95">
          {/* Bookmark tabs */}
          <div className="flex flex-col gap-1 py-4 pl-2 pr-1 border-r border-gray-200 flex-shrink-0">
            {availableTabs.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-l-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                    active ? "text-white shadow" : "text-gray-500 hover:bg-gray-100"
                  }`}
                  style={active ? { backgroundColor: typeColor } : undefined}
                  title={label}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            {tab === "bio" && (
              <div className="flex flex-col gap-4">
                {pokemon.flavorText && (
                  <div className="relative rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-gray-700 text-sm leading-snug pr-8">{pokemon.flavorText}</p>
                    <button
                      onClick={speak}
                      disabled={speaking}
                      className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white hover:bg-gray-100 text-gray-700 flex items-center justify-center shadow disabled:opacity-60"
                      aria-label="Read description aloud"
                      title="Read aloud"
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-center">
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
                {/* Summary — quick-glance extras, lives on the same Bio page */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Summary</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pokemon.eggGroups?.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
                        {formatName(g)} Egg Group
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "stats" && pokemon.stats && (
              <div className="flex flex-col gap-2">
                {pokemon.stats.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-bold text-gray-600 flex-shrink-0">{s.name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, (s.value / STAT_MAX) * 100)}%`, backgroundColor: typeColor }}
                      />
                    </div>
                    <span className="w-8 text-xs font-black text-gray-800 text-right flex-shrink-0">{s.value}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "abilities" && pokemon.abilities && (
              <div className="flex flex-col gap-3">
                {pokemon.abilities.map((a) => (
                  <div key={a.name} className="text-sm">
                    <span className="font-bold text-gray-800">{formatName(a.name)}</span>
                    {a.isHidden && <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">(Hidden)</span>}
                    {a.effect && <p className="text-xs text-gray-500 leading-snug mt-0.5">{a.effect}</p>}
                  </div>
                ))}
              </div>
            )}

            {tab === "forms" && (
              <div className="grid grid-cols-2 gap-3">
                {pokemon.altForms?.map((f) => (
                  <div key={f.slug} className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.homeSpriteUrl ?? f.artworkUrl ?? HOME_SPRITE(pokemon.id)}
                      alt={f.displayName}
                      className="w-16 h-16 object-contain"
                    />
                    <p className="text-[11px] font-bold text-gray-700 text-center leading-tight">{f.displayName}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === "eggGroups" && (
              <div className="flex flex-wrap gap-2">
                {pokemon.eggGroups?.map((g) => (
                  <span key={g} className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-bold">
                    {formatName(g)}
                  </span>
                ))}
              </div>
            )}

            {tab === "moves" && (
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[3rem_1fr] gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 px-1">
                  <span>Lv.</span>
                  <span>Move</span>
                </div>
                {pokemon.levelUpMoves?.map((m) => (
                  <div key={m.name} className="grid grid-cols-[3rem_1fr] gap-2 text-sm px-1 py-1 odd:bg-gray-50 rounded">
                    <span className="font-black text-gray-500">{m.level === 0 ? "—" : m.level}</span>
                    <span className="font-semibold text-gray-800">{formatName(m.name)}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "evolution" && (
              <div className="flex flex-col gap-3">
                {pokemon.evolutionSteps?.map((s, i) => (
                  <div key={`${s.id}-${i}`} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={HOME_SPRITE(s.id)} alt={s.name} className="w-14 h-14 object-contain flex-shrink-0" />
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{formatName(s.name)}</p>
                      {s.trigger && (
                        <p className="text-[11px] text-gray-500">
                          {s.trigger === "level-up" && s.minLevel ? `Level ${s.minLevel}` : null}
                          {s.trigger === "use-item" && s.item ? `Use ${formatName(s.item)}` : null}
                          {s.trigger !== "level-up" && s.trigger !== "use-item" ? formatName(s.trigger) : null}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
