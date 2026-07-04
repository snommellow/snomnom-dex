#!/usr/bin/env tsx
// Temporary debug script — dumps raw API data to diagnose Rapidash/Arcanine candidate pools.
import { writeFileSync } from "fs";

function headers(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCards(name: string) {
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${name}"&select=id,name,number,rarity,subtypes,artist,set,images,tcgplayer`;
  const res = await fetch(url, { headers: headers() });
  const json = await res.json();
  return json.data ?? [];
}

async function main() {
  const rapidash = await fetchCards("Galarian Rapidash");
  const arcanine = await fetchCards("Hisuian Arcanine");
  writeFileSync("lib/debug-cards.json", JSON.stringify({ rapidash, arcanine }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
