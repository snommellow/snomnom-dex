import { writeFileSync } from "fs";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

async function fetchAll(name: string) {
  const url = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

async function main() {
  const lele = await fetchAll("Tapu Lele");
  const fini = await fetchAll("Tapu Fini");
  const koko = await fetchAll("Tapu Koko");
  writeFileSync("lib/debug-cards.json", JSON.stringify({ lele, fini, koko }, null, 2));
  console.log(`Wrote ${lele.length} Lele, ${fini.length} Fini, ${koko.length} Koko cards`);
}

main();
