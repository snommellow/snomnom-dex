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
async function fetchCardNames(q: string): Promise<string[]> {
  try {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&select=id,name,rules`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return [`(HTTP ${res.status})`];
    const json = await res.json();
    return (json.data ?? []).map((c: any) => `${c.id}: ${c.name}${c.rules ? " | " + c.rules.join(" ") : ""}`);
  } catch (e) {
    return [`(error: ${String(e)})`];
  }
}

async function main() {
  const pageTitles = ["Swimmer", "Swimmer♂", "Swimmer♀", "Swimmer (male)", "Swimmer (female)", "Swimmer Girls", "Swimmers"];
  const catResults = await Promise.all(pageTitles.map(fetchCategories));

  const cardResults = await fetchCardNames('name:"Swimmer*"');

  writeFileSync(
    join(import.meta.dirname, "../lib/debug-swimmer.json"),
    JSON.stringify({ categories: catResults, cards: cardResults }, null, 2)
  );
  console.log(JSON.stringify({ categories: catResults, cards: cardResults }, null, 2));
  console.log("done");
}

main();
