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
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,set,images,tcgplayer`;
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
  const out: Record<string, unknown> = {};

  const burmySpecies = await fetch("https://pokeapi.co/api/v2/pokemon-species/412").then(r => r.json());
  out.burmyVarieties = (burmySpecies.varieties as any[]).map(v => ({ name: v.pokemon.name, isDefault: v.is_default }));

  const burmyCards = await fetchAll(`name:"Burmy"`);
  out.burmyCards = burmyCards.filter(c => c.images?.large).map(c => ({
    id: c.id, name: c.name, set: c.set.name, setId: c.set.id, number: c.number, rarity: c.rarity, price: marketPrice(c), image: c.images.large,
  })).sort((a: any, b: any) => b.price - a.price);

  const wormadamCards = await fetchAll(`name:"Wormadam"`);
  out.wormadamCards = wormadamCards.filter(c => c.images?.large).map(c => ({
    id: c.id, name: c.name, set: c.set.name, setId: c.set.id, number: c.number, rarity: c.rarity, price: marketPrice(c), image: c.images.large,
  })).sort((a: any, b: any) => b.price - a.price);

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
