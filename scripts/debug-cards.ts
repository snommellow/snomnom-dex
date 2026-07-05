import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["ash-greninja"] = await search("Ash-Greninja");
  out["ash-greninja2"] = await search("Ash Greninja");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
