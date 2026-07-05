import fs from "fs";

async function main() {
  const res = await fetch("https://pokeapi.co/api/v2/pokemon-species/658");
  const data = await res.json();
  const varieties = (data.varieties as any[]).map(v => ({ is_default: v.is_default, name: v.pokemon.name }));
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify({ greninja_species: varieties }, null, 2));
}

main();
