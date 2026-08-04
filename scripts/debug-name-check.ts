#!/usr/bin/env tsx
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

interface CategoryMember {
  title: string;
}

async function fetchAllCategoryMembers(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  for (let page = 0; page < 30; page++) {
    const url = `${BULBAPEDIA_API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
      category
    )}&cmlimit=500&format=json${cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      const members: CategoryMember[] = json?.query?.categorymembers ?? [];
      titles.push(...members.map((m) => m.title));
      cmcontinue = json?.continue?.cmcontinue;
      if (!cmcontinue) break;
    } catch {
      break;
    }
  }
  return titles;
}

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

function loadRosterNames(): Set<string> {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const names = new Set<string>();
  const re = /name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.add(m[1].toLowerCase());
  return names;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// Filters out non-character noise: locations, items, moves, meta/wiki pages, disambiguation.
const NOISE_RE =
  /^(Category:|User:|Talk:|List of|Pokémon (Center|Gym|League|Mart|Tower)|.*(Cave|City|Town|Route|Forest|Island|Mountain|Building|Lab|HQ|Hideout|Stadium|Tower|Village)$)/i;

async function main() {
  const regionCategories: Record<string, string> = {
    Kanto: "Category:Kanto characters",
    Johto: "Category:Johto characters",
    Hoenn: "Category:Hoenn characters",
    Sinnoh: "Category:Sinnoh characters",
    Unova: "Category:Unova characters",
    Kalos: "Category:Kalos characters",
    Alola: "Category:Alola characters",
    Galar: "Category:Galar characters",
    Paldea: "Category:Paldea characters",
    Hisui: "Category:Legends: Arceus characters",
    Lumiose: "Category:Legends: Z-A characters",
  };

  const rosterNames = loadRosterNames();
  const perRegionMissing: Record<string, string[]> = {};

  for (const [region, cat] of Object.entries(regionCategories)) {
    const titles = await fetchAllCategoryMembers(cat);
    const missing = titles
      .filter((t) => !NOISE_RE.test(t))
      .map((t) => t.replace(/\s*\(.*?\)\s*$/, "").trim())
      .filter((clean) => clean && !rosterNames.has(clean.toLowerCase()));
    perRegionMissing[region] = [...new Set(missing)];
    console.log(`${region}: ${titles.length} total, ${perRegionMissing[region].length} missing`);
  }

  // Also directly verify the two names the user flagged, plus a Clive Bulbapedia check.
  const specificChecks = await mapLimit(
    ["Bellelba", "Bellelba and Benga", "Benga", "Clive"],
    5,
    fetchCategories
  );

  writeFileSync(
    join(import.meta.dirname, "../lib/debug-name-check.json"),
    JSON.stringify({ perRegionMissing, specificChecks }, null, 2)
  );
  console.log("done");
}

main();
