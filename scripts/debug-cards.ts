#!/usr/bin/env tsx
// Temporary debug script — dumps the full raw PokeAPI species "names" array for Ponyta
// to find the correct language key for Chinese.
import { writeFileSync } from "fs";

async function main() {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon-species/77");
  const data = await res.json();
  writeFileSync("lib/debug-cards.json", JSON.stringify({ names: data.names }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
