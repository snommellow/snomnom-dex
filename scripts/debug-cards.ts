import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
  if (!res.ok) return { id, error: res.status };
  const data = await res.json();
  const c = data.data;
  return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, images: c.images };
}

async function searchShaymin() {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"Shaymin"&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({
    id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes,
    abilities: c.abilities?.map((a: any) => a.name),
  }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["SWSH253"] = await getCard("swshp-SWSH253");
  out["SWSH254"] = await getCard("swshp-SWSH254");
  out["SWSH255"] = await getCard("swshp-SWSH255");
  out["SWSH256"] = await getCard("swshp-SWSH256");
  out["shaymin_search"] = await searchShaymin();
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
