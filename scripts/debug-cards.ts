import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function main() {
  const setsRes = await fetch(`https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate`, { headers });
  const setsData = setsRes.ok ? await setsRes.json() : { error: setsRes.status };
  const sets = (setsData.data as any[] | undefined)?.map(s => ({ id: s.id, name: s.name, releaseDate: s.releaseDate })) ?? setsData;

  const abilityRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=abilities.name:"Sky Support"&pageSize=50`, { headers });
  const abilityData = abilityRes.ok ? await abilityRes.json() : { error: abilityRes.status };

  const out = { recentSets: sets, skySupportSearch: abilityData.data ?? abilityData };
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
