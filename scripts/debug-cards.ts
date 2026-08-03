#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

async function checkUrl(url: string): Promise<{ url: string; ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, { method: "GET" });
    return { url, ok: res.ok, status: res.status };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function main() {
  const urls = [
    "https://archives.bulbagarden.net",
    "https://archives.bulbagarden.net/media/upload/f/f2/Falkner.png",
    "https://bulbapedia.bulbagarden.net/wiki/Falkner",
    "https://bulbapedia.bulbagarden.net/w/api.php?action=query&titles=Falkner&format=json",
  ];
  const results = await Promise.all(urls.map(checkUrl));
  for (const r of results) console.log(JSON.stringify(r));
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
