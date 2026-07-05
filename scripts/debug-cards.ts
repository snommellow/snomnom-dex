import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

function price(c: any): number {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const vals = Object.values(tp).map((v: any) => v?.market ?? 0).filter((n: number) => n > 0);
    if (vals.length) return Math.max(...vals);
  }
  return c.cardmarket?.prices?.averageSellPrice ?? 0;
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[])
    .map(c => ({ id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity, subtypes: c.subtypes, price: price(c) }))
    .sort((a, b) => b.price - a.price);
}

async function search2(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[])
    .map(c => ({ id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity, subtypes: c.subtypes, price: price(c) }))
    .sort((a, b) => b.price - a.price);
}

async function main() {
  const out: Record<string, unknown> = {};
  out["galarian-articuno"] = await search("Galarian Articuno");
  out["galarian-zapdos"] = await search("Galarian Zapdos");
  out["galarian-moltres"] = await search("Galarian Moltres");
  out["omastar"] = await search2("Omastar");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
