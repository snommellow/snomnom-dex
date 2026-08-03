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
    const res = await fetch(url);
    if (!res.ok) break;
    const json = await res.json();
    const members: CategoryMember[] = json?.query?.categorymembers ?? [];
    titles.push(...members.map((m) => m.title));
    cmcontinue = json?.continue?.cmcontinue;
    if (!cmcontinue) break;
  }
  return titles;
}

function loadRosterNames(): Set<string> {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const names = new Set<string>();
  const re = /name:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    names.add(m[1].toLowerCase());
  }
  return names;
}

async function main() {
  const titles = await fetchAllCategoryMembers("Category:Trainer classes");
  console.log(`Got ${titles.length} trainer class pages from Bulbapedia`);

  const rosterNames = loadRosterNames();
  const missing: string[] = [];
  for (const title of titles) {
    // Bulbapedia trainer-class titles are often plain ("Youngster") but some carry a
    // disambiguating suffix ("Team Rocket Grunt (Trainer class)") — strip it for comparison.
    const clean = title.replace(/\s*\(Trainer class\)\s*$/i, "").trim();
    if (!rosterNames.has(clean.toLowerCase())) missing.push(clean);
  }

  writeFileSync(
    join(import.meta.dirname, "../lib/debug-trainer-classes.json"),
    JSON.stringify({ totalCount: titles.length, missing }, null, 2)
  );
  console.log(`done — ${missing.length} trainer classes not yet in the roster`);
}

main();
