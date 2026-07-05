#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}
async function fetchAll(q: string) {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,artist,attacks,set,images,tcgplayer`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data ?? [];
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}
function marketPrice(c: any): number {
  const prices = c.tcgplayer?.prices;
  if (!prices) return 0;
  return Math.max(0, ...Object.values(prices).map((v: any) => v?.market ?? v?.mid ?? 0));
}

async function main() {
  const speciesRes = await fetch("https://pokeapi.co/api/v2/pokemon-species/128");
  const species = await speciesRes.json();
  const varieties = (species.varieties as any[]).map(v => ({ name: v.pokemon.name, isDefault: v.is_default }));

  const all = await fetchAll(`name:"Paldean Tauros"`);
  const cards = all
    .filter(c => c.images?.large)
    .map(c => ({
      id: c.id, name: c.name, set: c.set.name, setId: c.set.id, number: c.number,
      rarity: c.rarity, artist: c.artist,
      attacks: (c.attacks ?? []).map((a: any) => a.name),
      types: c.types,
      price: marketPrice(c),
      image: c.images.large,
    }))
    .sort((a, b) => b.price - a.price);

  writeFileSync("lib/debug-cards.json", JSON.stringify({ varieties, cards }, null, 2));
  console.log(`wrote lib/debug-cards.json with ${cards.length} cards`);
}

main();
