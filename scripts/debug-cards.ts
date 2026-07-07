import { writeFileSync, mkdirSync } from "fs";

async function main() {
  mkdirSync("lib/debug-images", { recursive: true });
  const urls: Record<string, string> = {
    "swsh7-151": "https://images.pokemontcg.io/swsh7/151_hires.png",
    "swsh7-153": "https://images.pokemontcg.io/swsh7/153_hires.png",
    "swsh7-168": "https://images.pokemontcg.io/swsh7/168_hires.png",
    "swsh7-170": "https://images.pokemontcg.io/swsh7/170_hires.png",
  };
  for (const [id, url] of Object.entries(urls)) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`lib/debug-images/${id}.png`, buf);
    console.log(`Wrote ${id} (${buf.length} bytes, status ${res.status})`);
  }
}

main();
