#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function fetchAllPages(q: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}`;
    let data: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const headers: Record<string, string> = {};
        if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        data = json.data;
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

async function main() {
  const names = ["Wellspring Mask Ogerpon", "Hearthflame Mask Ogerpon", "Cornerstone Mask Ogerpon", "Teal Mask Ogerpon", "Annihilape", "Clodsire", "Maschiff", "Glimmora", "Squawkabilly", "Arboliva"];
  const out: Record<string, any[]> = {};
  for (const name of names) {
    const cards = await fetchAllPages(`name:"${name}"`);
    out[name] = cards.map(c => ({
      id: c.id,
      name: c.name,
      rarity: c.rarity,
      set: c.set?.id,
      number: c.number,
      market: c.tcgplayer?.prices ? Math.max(0, ...Object.values(c.tcgplayer.prices).map((v: any) => v?.market ?? v?.mid ?? 0)) : 0,
      image: c.images?.large,
    }));
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(out, null, 2));
  console.log("done");
}

main();
