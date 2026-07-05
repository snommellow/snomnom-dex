#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}
async function fetchAll(q: string) {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,set,images`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data ?? [];
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

async function main() {
  const cards = await fetchAll(`name:"Shaymin"`);
  const matches = cards.filter(c => /triumphant/i.test(c.set.name) || c.number === "81");
  writeFileSync("lib/debug-cards.json", JSON.stringify(matches, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
