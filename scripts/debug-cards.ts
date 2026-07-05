#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const res = await fetch(`${PTCGIO_BASE}/sets?orderBy=-releaseDate&pageSize=30`, { headers: getHeaders() });
  const json = await res.json();
  const sets = (json.data ?? []).map((s: any) => ({ id: s.id, name: s.name, series: s.series, releaseDate: s.releaseDate }));
  writeFileSync("lib/debug-cards.json", JSON.stringify(sets, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
