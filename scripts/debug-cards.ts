import fs from "fs";

async function main() {
  const out: Record<string, unknown> = {};
  const listRes = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=1025&offset=0`);
  const listData = await listRes.json();
  out["list_count"] = listData.count;
  out["list_results_length"] = listData.results.length;
  out["last_10_results"] = listData.results.slice(-10);

  for (const id of [1022, 1023, 1024, 1025]) {
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      out[`pokemon_${id}`] = res.ok ? { status: res.status, name: (await res.json()).name } : { status: res.status };
    } catch (e) { out[`pokemon_${id}`] = { error: String(e) }; }
  }
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
