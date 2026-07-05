import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity, subtypes: c.subtypes };
  } catch (e) { return { id, error: String(e) }; }
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=20`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["sm12-75"] = await getCard("sm12-75");
  out["appletun-vmax"] = await search("Appletun VMAX");
  out["toxtricity-vmax"] = await search("Toxtricity VMAX");
  out["urshifu-single-vmax"] = await search("Single Strike Urshifu VMAX");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
