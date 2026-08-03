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
  for (let page = 0; page < 20; page++) {
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

function loadRosterNames(): Set<string> {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const names = new Set<string>();
  const re = /name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.add(m[1].toLowerCase());
  return names;
}

async function main() {
  const categories = [
    "Category:Protagonists",
    "Category:Rivals",
    "Category:Team Admins",
    "Category:Team Rocket",
    "Category:Team Aqua",
    "Category:Team Magma",
    "Category:Team Galactic",
    "Category:Team Plasma",
    "Category:Team Flare",
    "Category:Team Skull",
    "Category:Aether Foundation",
    "Category:Team Yell",
    "Category:Macro Cosmos",
    "Category:Team Star",
    "Category:Professors",
  ];
  const rosterNames = loadRosterNames();
  const results: Record<string, { total: number; missing: string[] }> = {};
  for (const cat of categories) {
    const titles = await fetchAllCategoryMembers(cat);
    const missing = titles
      .map((t) => t.replace(/\s*\(.*?\)\s*$/, "").trim())
      .filter((clean) => !rosterNames.has(clean.toLowerCase()));
    results[cat] = { total: titles.length, missing: [...new Set(missing)] };
    console.log(`${cat}: ${titles.length} total, ${results[cat].missing.length} missing`);
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-role-sweep.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
