import { writeFileSync } from "fs";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

async function fetchDetail(id: string) {
  const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
  return res.json();
}

async function main() {
  const ids = ["A3-084", "A3-170", "A3-056", "A3-164", "A3-068", "A3-166", "A3a-019", "A3a-077", "A3a-084", "B1-322"];
  const results: Record<string, any> = {};
  for (const id of ids) {
    results[id] = await fetchDetail(id);
  }
  writeFileSync("lib/debug-cards.json", JSON.stringify(results, null, 2));
  console.log(`Wrote ${Object.keys(results).length} card details`);
}

main();
