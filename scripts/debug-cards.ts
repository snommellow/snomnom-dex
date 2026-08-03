#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

// Uses the MediaWiki API's pageimages module — returns the page's main infobox image,
// which for trainer pages is almost always their official artwork.
async function fetchPageImage(title: string): Promise<{ title: string; found: boolean; imageUrl?: string; error?: string }> {
  try {
    const url = `${BULBAPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&format=json&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return { title, found: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const pages = json?.query?.pages;
    if (!pages) return { title, found: false, error: "no pages field" };
    const page = Object.values(pages)[0] as any;
    if (page?.missing !== undefined) return { title, found: false, error: "page missing" };
    const imageUrl = page?.original?.source;
    return { title, found: !!imageUrl, imageUrl };
  } catch (e) {
    return { title, found: false, error: String(e) };
  }
}

async function main() {
  // A representative sample of currently-null trainers across several categories.
  const names = [
    "Chuck", "Pryce", "Clair", "Bugsy", "Wattson", "Maylene", "Viola", "Wulfric",
    "Eusine", "Mr. Pokémon", "Kurt", "Cogita", "Anabel", "Noland", "Greta",
  ];
  const results = await Promise.all(names.map(fetchPageImage));
  for (const r of results) console.log(JSON.stringify(r));
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
