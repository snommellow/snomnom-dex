import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function search(name: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=10`, { headers });
    if (!res.ok) return { error: res.status };
    const data = await res.json();
    return (data.data as any[]).map(c => ({ id: c.id, name: c.name }));
  } catch (e) { return { error: String(e) }; }
}

const candidates: Record<string, string> = {
  "741 oricorio-baile": "Oricorio",
  "745 lycanroc-midday": "Lycanroc",
  "746 wishiwashi-solo": "Wishiwashi",
  "772 type-null": "Type: Null",
  "774 minior-red-meteor": "Minior",
  "778 mimikyu-disguised": "Mimikyu",
  "785 tapu-koko": "Tapu Koko",
  "786 tapu-lele": "Tapu Lele",
  "787 tapu-bulu": "Tapu Bulu",
  "788 tapu-fini": "Tapu Fini",
  "849 toxtricity-amped": "Toxtricity",
  "862 obstagoon": "Obstagoon",
  "863 perrserker": "Perrserker",
  "864 cursola": "Cursola",
  "865 sirfetchd": "Sirfetch'd",
  "866 mr-rime": "Mr. Rime",
  "867 runerigus": "Runerigus",
  "875 eiscue-ice": "Eiscue",
  "876 indeedee-male": "Indeedee",
  "877 morpeko-full-belly": "Morpeko",
  "892 urshifu-single-strike": "Urshifu",
  "902 basculegion-male": "Basculegion",
  "903 sneasler": "Sneasler",
  "904 overqwil": "Overqwil",
  "905 enamorus-incarnate": "Enamorus",
  "916 oinkologne-male": "Oinkologne",
  "925 maushold-family-of-four": "Maushold",
  "931 squawkabilly-green-plumage": "Squawkabilly",
  "964 palafin-zero": "Palafin",
  "978 tatsugiri-curly": "Tatsugiri",
  "980 clodsire": "Clodsire",
  "982 dudunsparce-two-segment": "Dudunsparce",
  "984 great-tusk": "Great Tusk",
  "985 scream-tail": "Scream Tail",
  "986 brute-bonnet": "Brute Bonnet",
  "987 flutter-mane": "Flutter Mane",
  "988 slither-wing": "Slither Wing",
  "989 sandy-shocks": "Sandy Shocks",
  "990 iron-treads": "Iron Treads",
  "991 iron-bundle": "Iron Bundle",
  "992 iron-hands": "Iron Hands",
  "993 iron-jugulis": "Iron Jugulis",
  "994 iron-moth": "Iron Moth",
  "995 iron-thorns": "Iron Thorns",
  "1005 roaring-moon": "Roaring Moon",
  "1006 iron-valiant": "Iron Valiant",
  "1009 walking-wake": "Walking Wake",
  "1010 iron-leaves": "Iron Leaves",
  "1017 ogerpon": "Ogerpon",
  "1021 raging-bolt": "Raging Bolt",
};

async function main() {
  const out: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(candidates)) {
    out[key] = await search(name);
  }
  out["solgaleo"] = await search("Solgaleo");
  out["lunala"] = await search("Lunala");
  out["buzzwole"] = await search("Buzzwole");
  out["pheromosa"] = await search("Pheromosa");
  out["gmax-appletun"] = await search("Gigantamax Appletun");
  out["gmax-toxtricity"] = await search("Gigantamax Toxtricity");
  out["gmax-urshifu-single"] = await search("Gigantamax Urshifu");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
