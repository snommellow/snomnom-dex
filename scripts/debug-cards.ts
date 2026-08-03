#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

// Pulls each page's categories — these reliably include tags like "Category:Sinnoh characters"
// or "Category:Characters in Pokémon Legends: Arceus" that let us verify region assignment
// against Bulbapedia directly instead of relying on memory.
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
    const relevant = cats.filter((c: string) =>
      /characters$|Trainers$|Legends|Gym Leaders|Elite Four|Champions|Team |Frontier Brain/i.test(c)
    );
    return { title, found: true, categories: relevant };
  } catch (e) {
    return { title, found: false, error: String(e) };
  }
}

async function main() {
  const names = [
    "Zisu", "Welder", "Molayne", "Samson Oak",
    "Cara Liss", "Dendra", "Gwynn", "Iscan", "Miriam", "Morgan", "Naveen",
    "Raifort", "Saguaro", "Salvatore", "Tarragon", "Jacinthe", "Honey", "Arezu", "Evelyn",
    "Anabel", "Noland", "Greta", "Tucker", "Lucy", "Spenser", "Brandon (game)",
    "Palmer", "Argenta", "Dahlia", "Darach", "Thorton",
    "Looker", "Ingo", "Emmet", "Cyllene", "Kamado", "Cogita", "Volo", "Adaman", "Irida",
    "Urbain", "Jett", "Canari",
  ];
  const results = await Promise.all(names.map(fetchCategories));
  for (const r of results) console.log(JSON.stringify(r));
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
