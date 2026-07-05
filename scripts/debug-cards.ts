import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, abilities: c.abilities?.map((a: any) => a.name) };
  } catch (e) { return { id, error: String(e) }; }
}

async function getSpecies(id: number) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    return { id, varieties: (data.varieties as any[]).map(v => ({ is_default: v.is_default, name: v.pokemon.name })) };
  } catch (e) { return { id, error: String(e) }; }
}

async function main() {
  const out: Record<string, unknown> = {};
  await new Promise(r => setTimeout(r, 2000));
  out["victini-142"] = await getCard("svp-142");
  out["victini-208"] = await getCard("svp-208");
  out["gothitelle-bw2-47"] = await getCard("bw2-47");
  out["gothitelle-svp-211"] = await getCard("svp-211");
  out["samurott-swsh239"] = await getCard("swshp-SWSH239");
  out["zoroark-swsh297"] = await getCard("swshp-SWSH297");
  out["thundurus-svp209"] = await getCard("svp-209");
  out["thundurus-bw9-110"] = await getCard("bw9-110");
  out["tornadus-svp210"] = await getCard("svp-210");
  out["tornadus-bw5-108"] = await getCard("bw5-108");
  out["kyurem-white-xy81"] = await getCard("xyp-XY81");
  out["kyurem-black-xy80"] = await getCard("xyp-XY80");
  out["kyurem-zsv10pt5-165"] = await getCard("zsv10pt5-165");
  out["kyurem-species"] = await getSpecies(646);
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
