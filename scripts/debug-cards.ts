import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
  if (!res.ok) return { id, error: res.status };
  const data = await res.json();
  const c = data.data;
  return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, abilities: c.abilities?.map((a: any) => a.name) };
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${name}"&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["victini-142"] = await getCard("svp-142");
  out["victini-208"] = await getCard("svp-208");
  out["gothitelle-bw2-47"] = await getCard("bw2-47");
  out["gothitelle-svp-211"] = await getCard("svp-211");
  out["samurott-swsh239"] = await getCard("swshp-SWSH239");
  out["zoroark-swsh297"] = await getCard("swshp-SWSH297");
  out["hisuian-samurott-search"] = await search("Hisuian Samurott");
  out["hisuian-zoroark-search"] = await search("Hisuian Zoroark");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
