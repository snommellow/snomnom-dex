#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function fetchCard(id: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${PTCGIO_BASE}/cards/${id}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("empty body");
      return JSON.parse(text).data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const ids = ["swsh10-161", "swsh6-170", "swsh6-174", "swsh6-177", "sv9-161", "sv3pt5-202"];
  const out: Record<string, any> = {};
  for (const id of ids) {
    const c = await fetchCard(id);
    out[id] = c ? { name: c.name, rarity: c.rarity, subtypes: c.subtypes, set: c.set?.id, images: c.images } : null;
    console.log(id, "->", c ? `${c.name} (${c.rarity})` : "NOT FOUND");
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(out, null, 2));
  console.log("done");
}

main();
