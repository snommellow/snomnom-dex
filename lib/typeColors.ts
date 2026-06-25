// Exact hex values from the Pokémon Home / Unbound reference
export const TYPE_COLOR: Record<string, string> = {
  normal:   "#828282",
  fire:     "#e4613e",
  water:    "#3a9de2",
  electric: "#dfbc28",
  grass:    "#439837",
  ice:      "#47c8c8",
  fighting: "#e49021",
  poison:   "#9354cb",
  ground:   "#a4733c",
  flying:   "#74aad0",
  psychic:  "#e96c8c",
  bug:      "#9f9f28",
  rock:     "#a9a481",
  ghost:    "#6f4570",
  dragon:   "#576fbc",
  dark:     "#4f4747",
  steel:    "#77b2cb",
  fairy:    "#e18ce1",
};

// Card gradient tints (subtle, derived from type colour)
export const TYPE_GRADIENT: Record<string, string> = {
  normal:   "from-gray-200 via-gray-100 to-white",
  fire:     "from-orange-200 via-red-100 to-white",
  water:    "from-blue-200 via-sky-100 to-white",
  electric: "from-yellow-200 via-amber-100 to-white",
  grass:    "from-green-200 via-lime-100 to-white",
  ice:      "from-cyan-200 via-sky-100 to-white",
  fighting: "from-amber-200 via-orange-100 to-white",
  poison:   "from-purple-200 via-pink-100 to-white",
  ground:   "from-amber-200 via-yellow-100 to-white",
  flying:   "from-indigo-200 via-sky-100 to-white",
  psychic:  "from-pink-200 via-rose-100 to-white",
  bug:      "from-lime-200 via-green-100 to-white",
  rock:     "from-yellow-300 via-amber-100 to-white",
  ghost:    "from-purple-300 via-indigo-100 to-white",
  dragon:   "from-violet-300 via-purple-100 to-white",
  dark:     "from-gray-400 via-gray-200 to-white",
  steel:    "from-slate-300 via-gray-100 to-white",
  fairy:    "from-pink-200 via-rose-100 to-white",
};

// Dot colour used in the filter pills sidebar
export const TYPE_DOT: Record<string, string> = {
  normal:   "bg-[#828282]",
  fire:     "bg-[#e4613e]",
  water:    "bg-[#3a9de2]",
  electric: "bg-[#dfbc28]",
  grass:    "bg-[#439837]",
  ice:      "bg-[#47c8c8]",
  fighting: "bg-[#e49021]",
  poison:   "bg-[#9354cb]",
  ground:   "bg-[#a4733c]",
  flying:   "bg-[#74aad0]",
  psychic:  "bg-[#e96c8c]",
  bug:      "bg-[#9f9f28]",
  rock:     "bg-[#a9a481]",
  ghost:    "bg-[#6f4570]",
  dragon:   "bg-[#576fbc]",
  dark:     "bg-[#4f4747]",
  steel:    "bg-[#77b2cb]",
  fairy:    "bg-[#e18ce1]",
};

// SVG icon URL from partywhale/pokemon-type-icons (same source as reference)
export function typeIconUrl(type: string): string {
  return `https://raw.githubusercontent.com/partywhale/pokemon-type-icons/main/icons/${type}.svg`;
}
