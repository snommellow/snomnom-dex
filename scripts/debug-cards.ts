#!/usr/bin/env tsx
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

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
  await downloadImage("https://images.pokemontcg.io/swsh11/172_hires.png", join(imgDir, "electrode-swsh11-172.png"));

  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
  const res = await fetch(`${PTCGIO_BASE}/cards/swsh11-172`, { headers });
  const json = await res.json();
  const c = json.data;
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({
    id: c.id, name: c.name, rarity: c.rarity, subtypes: c.subtypes, set: c.set?.id,
  }, null, 2));
  console.log("done");
}

main();
