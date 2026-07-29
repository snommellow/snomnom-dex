#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function fetchAllPages(q: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,name,supertype,subtypes,rarity,set,number,images`;
    let data: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const headers: Record<string, string> = {};
        if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text) throw new Error("empty body");
        data = JSON.parse(text).data;
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

// Currently-null Kanto roster entries — search broadly (no subtype restriction) to see what
// actually exists under any name variant, so we can fix the searchNames guesses in trainerapi.ts.
const QUERIES = [
  "Sailor", "Jr. Trainer", "Swimmer", "Cue Ball", "Rocker", "Tamer",
  "Chief", "Scientist", "Rocket Grunt", "Cooltrainer", "Biker", "Burglar",
  "Misty", "Lt. Surge", "Erika", "Koga", "Blaine", "Sabrina", "Gentleman",
  "Lorelei", "Channeler", "Agatha", "Lance", "Bruno",
];

async function main() {
  const out: Record<string, any[]> = {};
  for (const q of QUERIES) {
    const cards = await fetchAllPages(`supertype:Trainer name:"${q}"`);
    out[q] = cards.map(c => ({ name: c.name, subtypes: c.subtypes, rarity: c.rarity, id: c.id }));
    console.log(q, "->", cards.length);
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(out, null, 2));
  console.log("done");
}

main();
