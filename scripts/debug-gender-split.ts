#!/usr/bin/env tsx
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

async function pageExists(title: string): Promise<boolean> {
  try {
    const url = `${BULBAPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&format=json&redirects=1`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const json = await res.json();
    const page = Object.values(json?.query?.pages ?? {})[0] as any;
    return page && page.missing === undefined;
  } catch {
    return false;
  }
}

function loadGenericEntries(): { name: string; searchNames: string[] }[] {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const entries: { name: string; searchNames: string[] }[] = [];
  const re = /\{\s*name:\s*"([^"]+)",\s*searchNames:\s*\[([^\]]*)\]\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const searchNames = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    entries.push({ name: m[1], searchNames });
  }
  return entries;
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

async function main() {
  const generic = loadGenericEntries().filter((e) => !/[♂♀]/.test(e.name));
  console.log(`Checking ${generic.length} generic (unisex-named) classes for ♂/♀ variants...`);

  const results = await mapLimit(generic, 15, async (e) => {
    const [male, female] = await Promise.all([pageExists(`${e.name}♂`), pageExists(`${e.name}♀`)]);
    return { name: e.name, hasMale: male, hasFemale: female };
  });

  const needsSplit = results.filter((r) => r.hasMale || r.hasFemale);
  writeFileSync(
    join(import.meta.dirname, "../lib/debug-gender-split.json"),
    JSON.stringify({ totalChecked: generic.length, needsSplit }, null, 2)
  );
  console.log(`done — ${needsSplit.length} classes have a ♂/♀ variant page on Bulbapedia`);
}

main();
