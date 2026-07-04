#!/usr/bin/env tsx
// Temporary debug script — full unrestricted card data to find what distinguishes
// bordered SVP reprints (Xatu svp-59, Feraligatr svp-89) from genuine full-art SVP
// promos (Snorlax svp-51, Noctowl svp-141).
import { writeFileSync } from "fs";

function headers(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCard(id: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers: headers() });
  const json = await res.json();
  return json.data ?? null;
}

async function main() {
  const ids = ["svp-59", "svp-89", "svp-51", "svp-141"];
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    results[id] = await fetchCard(id);
  }
  writeFileSync("lib/debug-cards.json", JSON.stringify(results, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
