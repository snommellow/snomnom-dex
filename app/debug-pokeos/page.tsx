"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const GEN1_DEX: Record<number, string> = {
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

// Known PokéOS sets for quick navigation
const KNOWN_SETS = [
  { id: 110, label: "110 — sv3pt5 alt" },
  { id: 111, label: "111 — sv3pt5 (151)" },
  { id: 384, label: "384 — Pocket Genetic Apex", ext: "png" },
  { id: 461, label: "461 — (Magnemite etc.)", ext: "png" },
];

function DebugGrid() {
  const params = useSearchParams();
  const setId  = parseInt(params.get("set")   ?? "461", 10);
  const start  = parseInt(params.get("start") ?? "1",   10);
  const count  = parseInt(params.get("count") ?? "150", 10);
  const ext    = params.get("ext") ?? "jpg";

  const BASE = `https://s3.pokeos.com/pokeos-uploads/tcg/textless/${setId}`;
  const cards = Array.from({ length: count }, (_, i) => start + i);

  function nav(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({
      set: String(setId), start: String(start), count: String(count), ext,
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    });
    window.location.search = p.toString();
  }

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-xl font-bold mb-3">PokéOS Debug — Set {setId}</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <label className="flex flex-col text-xs text-gray-400 gap-1">
          Set ID
          <input
            type="number" defaultValue={setId}
            className="w-24 bg-gray-800 rounded px-2 py-1 text-white text-sm"
            onKeyDown={(e) => e.key === "Enter" && nav({ set: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-400 gap-1">
          Start #
          <input
            type="number" defaultValue={start}
            className="w-20 bg-gray-800 rounded px-2 py-1 text-white text-sm"
            onKeyDown={(e) => e.key === "Enter" && nav({ start: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-400 gap-1">
          Count
          <input
            type="number" defaultValue={count}
            className="w-20 bg-gray-800 rounded px-2 py-1 text-white text-sm"
            onKeyDown={(e) => e.key === "Enter" && nav({ count: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label className="flex flex-col text-xs text-gray-400 gap-1">
          Ext
          <select
            value={ext}
            className="bg-gray-800 rounded px-2 py-1 text-white text-sm"
            onChange={(e) => nav({ ext: e.target.value })}
          >
            <option value="jpg">jpg</option>
            <option value="png">png</option>
          </select>
        </label>
        <button
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm self-end"
          onClick={() => {
            const setEl  = document.querySelectorAll("input")[0] as HTMLInputElement;
            const stEl   = document.querySelectorAll("input")[1] as HTMLInputElement;
            const ctEl   = document.querySelectorAll("input")[2] as HTMLInputElement;
            nav({ set: setEl.value, start: stEl.value, count: ctEl.value });
          }}
        >
          Go
        </button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 mb-5">
        {KNOWN_SETS.map((s) => (
          <button
            key={s.id}
            onClick={() => nav({ set: s.id, start: 1, count: 250, ext: s.ext ?? "jpg" })}
            className={`px-2 py-0.5 rounded text-xs ${s.id === setId ? "bg-yellow-500 text-black font-bold" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="text-gray-500 text-xs mb-4">
        Showing {BASE}/{start}–{start + count - 1}.{ext} · Missing images hide automatically · Green = likely Gen 1
      </p>

      {/* Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
        {cards.map((n) => {
          const dexName = GEN1_DEX[n];
          return (
            <div
              key={n}
              id={`c${n}`}
              className={`flex flex-col items-center gap-1 rounded p-1 ${dexName ? "bg-green-900/40 ring-1 ring-green-500" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE}/${n}.${ext}`}
                alt={String(n)}
                className="w-20 rounded shadow bg-gray-800"
                onError={() => {
                  const el = document.getElementById(`c${n}`);
                  if (el) el.style.display = "none";
                }}
              />
              <span className="text-yellow-300 text-[10px] font-bold">{n}</span>
              {dexName && <span className="text-green-300 text-[9px] text-center leading-tight">{dexName}</span>}
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
