#!/usr/bin/env tsx
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

async function fetchCard(id: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${PTCGIO_BASE}/cards/${id}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error("empty body");
      return JSON.parse(text).data;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function downloadImage(url: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buf);
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function main() {
  const imgDir = join(import.meta.dirname, "../lib/debug-images");
  if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });
  const ids = ["sm5-145", "sm5-143", "sm6-95", "swsh11-172"];
  const out: any[] = [];
  for (const id of ids) {
    const c = await fetchCard(id);
    out.push({ id: c.id, name: c.name, rarity: c.rarity, subtypes: c.subtypes, set: c.set?.id, artist: c.artist });
    if (c.images?.large) await downloadImage(c.images.large, join(imgDir, `${id.replace(/[^a-z0-9-]/gi, "_")}.png`));
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(out, null, 2));
  console.log("done");
}

main();
