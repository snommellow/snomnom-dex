#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function main() {
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  const res = await fetch(`${PTCGIO_BASE}/cards/ex7-103`, { headers });
  const json = await res.json();
  const c = json.data;
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({
    id: c.id, name: c.name, rarity: c.rarity, subtypes: c.subtypes, set: c.set?.id, artist: c.artist,
  }, null, 2));
  console.log("done");
}

main();
