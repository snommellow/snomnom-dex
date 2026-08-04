#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

async function fetchCategories(title: string): Promise<{ title: string; found: boolean; categories?: string[]; error?: string }> {
  try {
    const url = `${BULBAPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=categories&cllimit=100&format=json&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return { title, found: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const pages = json?.query?.pages;
    if (!pages) return { title, found: false, error: "no pages field" };
    const page = Object.values(pages)[0] as any;
    if (page?.missing !== undefined) return { title, found: false, error: "page missing" };
    const cats = (page?.categories ?? []).map((c: any) => c.title.replace(/^Category:/, ""));
    return { title, found: true, categories: cats };
  } catch (e) {
    return { title, found: false, error: String(e) };
  }
}

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}
async function fetchPokefanCards(): Promise<string[]> {
  try {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent('name:"Poke*fan*"')}&pageSize=50&select=id,name,rarity,set`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return [`(HTTP ${res.status})`];
    const json = await res.json();
    return (json.data ?? []).map((c: any) => `${c.id}: ${c.name} (${c.rarity}, ${c.set?.id})`);
  } catch (e) {
    return [`(error: ${String(e)})`];
  }
}

async function main() {
  const namesToCheck = [
    "Winstrate Family", "Kruger Family", "Rising Star Duo", "Sparring Partners",
    "Veteran Duo", "Veteran Star", "Artist Family", "Dancing Family", "Karate Family",
    "Poké Fan Family", "Ace Duo", "Twin Brothers", "Twin Sisters", "Close Siblings",
    "Athletic Siblings", "Crush Kin", "Master & Apprentice", "Golf Buddies", "Honeymooners",
    "Punk Couple", "Punk Pair", "Cool Couple", "Daring Couple", "Mature Couple",
    "May-December Couple", "Young Couple", "Youthful Couple", "Tourist Couple",
    "Capoeira Couple", "Three Brothers", "Three Sisters", "Coffee Aficionados",
  ];
  const results = await Promise.all(namesToCheck.map(fetchCategories));
  const pokefanCards = await fetchPokefanCards();

  writeFileSync(
    join(import.meta.dirname, "../lib/debug-region-scope.json"),
    JSON.stringify({ results, pokefanCards }, null, 2)
  );
  for (const r of results) console.log(JSON.stringify(r));
  console.log("Poké Fan cards:", JSON.stringify(pokefanCards));
  console.log("done");
}

main();
