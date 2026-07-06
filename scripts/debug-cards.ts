import { writeFileSync, mkdirSync } from "fs";

async function main() {
  mkdirSync("lib/debug-images", { recursive: true });
  const urls: Record<string, string> = {
    "bw4-30": "https://images.pokemontcg.io/bw4/30_hires.png",
    "bw2-24": "https://images.pokemontcg.io/bw2/24_hires.png",
    "bw2-25": "https://images.pokemontcg.io/bw2/25_hires.png",
    "bw1-35": "https://images.pokemontcg.io/bw1/35_hires.png",
    "sm11-43": "https://images.pokemontcg.io/sm11/43_hires.png",
    "swsh8-70": "https://images.pokemontcg.io/swsh8/70_hires.png",
    "rsv10pt5-24": "https://images.pokemontcg.io/rsv10pt5/24_hires.png",
    "rsv10pt5-108": "https://images.pokemontcg.io/rsv10pt5/108_hires.png",
  };
  for (const [id, url] of Object.entries(urls)) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`lib/debug-images/${id}.png`, buf);
    console.log(`Wrote ${id} (${buf.length} bytes)`);
  }
}

main();
