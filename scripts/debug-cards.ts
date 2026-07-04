#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const res = await fetch(`${PTCGIO_BASE}/cards/sv10-231`, { headers: getHeaders() });
  const json = await res.json();
  writeFileSync("lib/debug-cards.json", JSON.stringify(json.data ?? json, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
