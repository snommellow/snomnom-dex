import fs from "fs";

async function getSpecies(id: number) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) return { id, error: res.status };
  const data = await res.json();
  return { id, varieties: (data.varieties as any[]).map(v => ({ is_default: v.is_default, name: v.pokemon.name })) };
}

const ids: Record<string, number> = {
  decidueye: 724, necrozma: 800, zacian: 888, zamazenta: 889, eternatus: 890,
  urshifu: 892, calyrex: 898, ursaluna: 901, indeedee: 876, basculegion: 902,
  oinkologne: 916, maushold: 925, squawkabilly: 931, tatsugiri: 978,
  dudunsparce: 982, palafin: 964, ogerpon: 1017, gimmighoul: 999,
  toxtricity: 849, eiscue: 875, morpeko: 877, minior: 774, oricorio: 741,
  lycanroc: 745, wishiwashi: 746, mimikyu: 778,
};

async function main() {
  const out: Record<string, unknown> = {};
  for (const [name, id] of Object.entries(ids)) {
    out[name] = await getSpecies(id);
  }
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
