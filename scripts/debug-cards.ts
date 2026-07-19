#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function main() {
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  // Latest sets by release date
  const setsRes = await fetch(`${PTCGIO_BASE}/sets?orderBy=-releaseDate&pageSize=15`, { headers });
  const setsJson = await setsRes.json();
  const sets = setsJson.data.map((s: any) => ({ id: s.id, name: s.name, releaseDate: s.releaseDate, total: s.total }));

  // For each of the 3 newest sets, count how many IR/SIR cards pokemontcg.io has indexed
  const rarityCounts: any[] = [];
  for (const s of sets.slice(0, 5)) {
    for (const rarity of ["Special Illustration Rare", "Illustration Rare"]) {
      const res = await fetch(`${PTCGIO_BASE}/cards?q=${encodeURIComponent(`set.id:${s.id} rarity:"${rarity}"`)}&pageSize=1`, { headers });
      const json = await res.json();
      rarityCounts.push({ set: s.id, rarity, count: json.totalCount });
    }
  }

  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({ sets, rarityCounts }, null, 2));
  console.log("done");
}

main();
