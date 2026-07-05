#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const out: Record<string, unknown> = {};
  for (const id of ["swshp-SWSH255", "swshp-SWSH253"]) {
    const res = await fetch(`${PTCGIO_BASE}/cards/${id}`, { headers: getHeaders() });
    const json = await res.json();
    out[id] = json.data;
  }
  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
