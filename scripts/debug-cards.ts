import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, images: c.images };
  } catch (e) { return { id, error: String(e) }; }
}

async function getTcgdexCard(id: string) {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`);
    if (!res.ok) return { id, error: res.status };
    return await res.json();
  } catch (e) { return { id, error: String(e) }; }
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["swsh11-186"] = await getCard("swsh11-186");
  out["A2b-096"] = await getTcgdexCard("A2b-096");
  out["origin-forme-giratina-search"] = await search("Origin Forme Giratina");
  out["giratina-search"] = await search("Giratina");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
