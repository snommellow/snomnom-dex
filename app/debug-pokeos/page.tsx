"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useRef } from "react";

const GEN1: Record<number, string> = {
  1:"Bulbasaur",2:"Ivysaur",3:"Venusaur",4:"Charmander",5:"Charmeleon",6:"Charizard",
  7:"Squirtle",8:"Wartortle",9:"Blastoise",10:"Caterpie",11:"Metapod",12:"Butterfree",
  13:"Weedle",14:"Kakuna",15:"Beedrill",16:"Pidgey",17:"Pidgeotto",18:"Pidgeot",
  19:"Rattata",20:"Raticate",21:"Spearow",22:"Fearow",23:"Ekans",24:"Arbok",
  25:"Pikachu",26:"Raichu",27:"Sandshrew",28:"Sandslash",29:"Nidoran♀",30:"Nidorina",
  31:"Nidoqueen",32:"Nidoran♂",33:"Nidorino",34:"Nidoking",35:"Clefairy",36:"Clefable",
  37:"Vulpix",38:"Ninetales",39:"Jigglypuff",40:"Wigglytuff",41:"Zubat",42:"Golbat",
  43:"Oddish",44:"Gloom",45:"Vileplume",46:"Paras",47:"Parasect",48:"Venonat",
  49:"Venomoth",50:"Diglett",51:"Dugtrio",52:"Meowth",53:"Persian",54:"Psyduck",
  55:"Golduck",56:"Mankey",57:"Primeape",58:"Growlithe",59:"Arcanine",60:"Poliwag",
  61:"Poliwhirl",62:"Poliwrath",63:"Abra",64:"Kadabra",65:"Alakazam",66:"Machop",
  67:"Machoke",68:"Machamp",69:"Bellsprout",70:"Weepinbell",71:"Victreebel",72:"Tentacool",
  73:"Tentacruel",74:"Geodude",75:"Graveler",76:"Golem",77:"Ponyta",78:"Rapidash",
  79:"Slowpoke",80:"Slowbro",81:"Magnemite",82:"Magneton",83:"Farfetch'd",84:"Doduo",
  85:"Dodrio",86:"Seel",87:"Dewgong",88:"Grimer",89:"Muk",90:"Shellder",91:"Cloyster",
  92:"Gastly",93:"Haunter",94:"Gengar",95:"Onix",96:"Drowzee",97:"Hypno",98:"Krabby",
  99:"Kingler",100:"Voltorb",101:"Electrode",102:"Exeggcute",103:"Exeggutor",
  104:"Cubone",105:"Marowak",106:"Hitmonlee",107:"Hitmonchan",108:"Lickitung",
  109:"Koffing",110:"Weezing",111:"Rhyhorn",112:"Rhydon",113:"Chansey",114:"Tangela",
  115:"Kangaskhan",116:"Horsea",117:"Seadra",118:"Goldeen",119:"Seaking",120:"Staryu",
  121:"Starmie",122:"Mr. Mime",123:"Scyther",124:"Jynx",125:"Electabuzz",126:"Magmar",
  127:"Pinsir",128:"Tauros",129:"Magikarp",130:"Gyarados",131:"Lapras",132:"Ditto",
  133:"Eevee",134:"Vaporeon",135:"Jolteon",136:"Flareon",137:"Porygon",138:"Omanyte",
  139:"Omastar",140:"Kabuto",141:"Kabutops",142:"Aerodactyl",143:"Snorlax",
  144:"Articuno",145:"Zapdos",146:"Moltres",147:"Dratini",148:"Dragonair",
  149:"Dragonite",150:"Mewtwo",151:"Mew",
};

const PRESETS = [
  { label: "sv3pt5 — 151 (set 111)", set: 111, start: 1,   count: 220, ext: "jpg" },
  { label: "sv3pt5 — 151 alt (set 110)", set: 110, start: 165, count: 80,  ext: "jpg" },
  { label: "Pocket Genetic Apex (set 384)", set: 384, start: 227, count: 24,  ext: "png" },
  { label: "Set 461",                       set: 461, start: 1,   count: 103, ext: "png" },
];

function DebugGrid() {
  const params = useSearchParams();
  const router = useRouter();

  const setId = parseInt(params.get("set")   ?? "111", 10);
  const start = parseInt(params.get("start") ?? "1",   10);
  const count = parseInt(params.get("count") ?? "220", 10);
  const ext   = params.get("ext") ?? "jpg";

  const setRef   = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const extRef   = useRef<HTMLSelectElement>(null);

  function go(overrides: Record<string, string | number> = {}) {
    const next = new URLSearchParams({
      set:   String(setRef.current?.value   ?? setId),
      start: String(startRef.current?.value ?? start),
      count: String(countRef.current?.value ?? count),
      ext:   extRef.current?.value ?? ext,
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    });
    router.push(`?${next}`);
  }

  const BASE  = `https://s3.pokeos.com/pokeos-uploads/tcg/textless/${setId}`;
  const cards = Array.from({ length: count }, (_, i) => start + i);

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-lg font-bold mb-3">PokéOS Set Browser</h1>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((p) => {
          const active = p.set === setId && p.start === start && p.ext === ext;
          return (
            <button
              key={p.label}
              onClick={() => go({ set: p.set, start: p.start, count: p.count, ext: p.ext })}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                active ? "bg-yellow-400 text-black" : "bg-gray-700 hover:bg-gray-600 text-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Manual controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-end bg-gray-800 p-3 rounded-lg">
        {[
          { label: "Set ID", ref: setRef,   defaultValue: setId,  width: "w-20", type: "number" },
          { label: "Start #", ref: startRef, defaultValue: start,  width: "w-20", type: "number" },
          { label: "Count",   ref: countRef, defaultValue: count,  width: "w-20", type: "number" },
        ].map(({ label, ref, defaultValue, width }) => (
          <label key={label} className="flex flex-col gap-1 text-xs text-gray-400">
            {label}
            <input
              ref={ref as React.RefObject<HTMLInputElement>}
              type="number"
              defaultValue={defaultValue}
              className={`${width} bg-gray-700 rounded px-2 py-1 text-white text-sm`}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Extension
          <select
            ref={extRef}
            defaultValue={ext}
            className="bg-gray-700 rounded px-2 py-1 text-white text-sm"
          >
            <option value="jpg">jpg</option>
            <option value="png">png</option>
          </select>
        </label>
        <button
          onClick={() => go()}
          className="px-4 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium self-end"
        >
          Go
        </button>
      </div>

      <p className="text-gray-500 text-xs mb-4">
        {BASE}/{start}–{start + count - 1}.{ext} · Missing cards hide automatically · <span className="text-green-400">Green = Gen 1 dex match</span>
      </p>

      {/* Card grid */}
      <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11 gap-2">
        {cards.map((n) => {
          const name = GEN1[n];
          return (
            <div
              key={n}
              id={`c${n}`}
              className={`flex flex-col items-center gap-1 rounded p-1 ${name ? "bg-green-900/40 ring-1 ring-green-500" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE}/${n}.${ext}`}
                alt={String(n)}
                className="w-full rounded shadow bg-gray-800"
                onError={() => {
                  const el = document.getElementById(`c${n}`);
                  if (el) el.style.display = "none";
                }}
              />
              <span className="text-yellow-300 text-[10px] font-bold">{n}</span>
              {name && <span className="text-green-300 text-[9px] text-center leading-tight">{name}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DebugPokeosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white bg-gray-900 min-h-screen">Loading…</div>}>
      <DebugGrid />
    </Suspense>
  );
}
