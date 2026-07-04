#!/usr/bin/env tsx
// Temporary debug script — dumps raw API data for specific cards to diagnose
// the extended-art sibling detection. Delete after use.
import { writeFileSync } from "fs";

function headers(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCards(name: string) {
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${name}"&select=id,name,number,rarity,subtypes,artist,set,images`;
  const res = await fetch(url, { headers: headers() });
  const json = await res.json();
  return json.data ?? [];
}

async function main() {
  const granbull = await fetchCards("Granbull V");
  const typhlosion = await fetchCards("Hisuian Typhlosion V");
  writeFileSync("lib/debug-cards.json", JSON.stringify({ granbull, typhlosion }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
