#!/usr/bin/env tsx
// Temporary debug script — dumps raw API data to diagnose Venomoth/Persian/Mareep/Flaaffy.
import { writeFileSync } from "fs";

function headers(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCards(q: string) {
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,name,number,rarity,subtypes,artist,set,images,tcgplayer,abilities,attacks`;
  const res = await fetch(url, { headers: headers() });
  const json = await res.json();
  return json.data ?? [];
}

async function main() {
  const mareep = await fetchCards('set.id:svp name:"Mareep"');
  const flaaffy = await fetchCards('set.id:svp name:"Flaaffy"');
  const venomoth = await fetchCards('name:"Venomoth"');
  const persian = await fetchCards('name:"Alolan Persian"');
  writeFileSync("lib/debug-cards.json", JSON.stringify({ mareep, flaaffy, venomoth, persian }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
