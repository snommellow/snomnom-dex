import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function search(name: string, setId?: string) {
  const q = setId ? `name:"${name}" set.id:${setId}` : `name:"${name}"`;
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, abilities: c.abilities?.map((a: any) => a.name) }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["victini-svp"] = await search("Victini", "svp");
  out["gothitelle-svp"] = await search("Gothitelle", "svp");
  out["thundurus-all"] = await search("Thundurus");
  out["tornadus-all"] = await search("Tornadus");
  out["landorus-all"] = await search("Landorus");
  out["meloetta-all"] = await search("Meloetta");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
