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
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,artist,abilities,attacks,set,images,tcgplayer`;
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

async function main() {
  const out: Record<string, unknown> = {};

  const snorlax = await fetchAll(`name:"Snorlax"`);
  out.hopsSnorlax = snorlax
    .filter(c => c.name.includes("Hop's"))
    .map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity, tcgplayer: c.tcgplayer }));
  out.snorlaxSvp = snorlax
    .filter(c => c.set.id === "svp")
    .map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity, tcgplayer: c.tcgplayer }));

  // Castform: check why base "Castform" query matches forme-specific card names.
  const castform = await fetchAll(`name:"Castform"`);
  out.castformNamesMatchingBase = castform
    .filter(c => c.name.toLowerCase().startsWith("castform"))
    .map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity }));

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
