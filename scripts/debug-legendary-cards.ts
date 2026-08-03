#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCards(q: string): Promise<unknown[]> {
  const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&select=id,name,rarity,set,images,tcgplayer`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return [];
}

async function main() {
  const results: Record<string, unknown> = {};
  for (const name of ["Kyogre", "Rayquaza"]) {
    const cards = await fetchCards(`name:"${name}*"`);
    results[name] = (cards as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      rarity: c.rarity,
      set: c.set?.id,
      hasImage: !!c.images?.large,
      market: c.tcgplayer?.prices
        ? Object.values(c.tcgplayer.prices as Record<string, { market?: number }>)
            .map((v) => v?.market)
            .filter((v) => typeof v === "number")
        : [],
    }));
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-legendary-cards.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
