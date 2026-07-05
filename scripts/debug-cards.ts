import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

function price(c: any): number {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const vals = Object.values(tp).map((v: any) => v?.market ?? 0).filter((n: number) => n > 0);
    if (vals.length) return Math.max(...vals);
  }
  const cm = c.cardmarket?.prices?.averageSellPrice;
  return cm ?? 0;
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[])
    .map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, price: price(c) }))
    .sort((a, b) => b.price - a.price);
}

async function getSpecies(id: number) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) return { id, error: res.status };
  const data = await res.json();
  return { id, varieties: (data.varieties as any[]).map(v => ({ is_default: v.is_default, name: v.pokemon.name })) };
}

async function main() {
  const out: Record<string, unknown> = {};
  out["landorus-all"] = await search("Landorus");
  out["thundurus-all"] = await search("Thundurus");
  out["tornadus-all"] = await search("Tornadus");
  out["meloetta-all"] = await search("Meloetta");
  out["basculin-species"] = await getSpecies(550);
  out["basculin-all"] = await search("Basculin");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
