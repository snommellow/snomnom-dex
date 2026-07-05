import fs from "fs";

async function main() {
  const setsRes = await fetch(`https://api.tcgdex.net/v2/en/sets`);
  const sets = setsRes.ok ? await setsRes.json() : { error: setsRes.status };
  const triumph = (sets as any[]).filter(s => /triumph/i.test(s.name));

  const cardsRes = await fetch(`https://api.tcgdex.net/v2/en/cards?name=Shaymin`);
  const cards = cardsRes.ok ? await cardsRes.json() : { error: cardsRes.status };

  const out = { triumphSets: triumph, shayminCards: cards };
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
