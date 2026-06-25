import { NextResponse } from "next/server";

// Probe PokéOS to discover which set number corresponds to each TCG set ID.
// We query pokemontcg.io for one known IR card per set, then scan PokéOS set IDs.

const TCG_SETS_TO_PROBE = [
  "sv1", "sv2", "sv3", "sv3pt5", "sv4", "sv4pt5",
  "sv5", "sv6", "sv6pt5", "sv7", "sv8", "sv8pt5",
  "swsh9", "swsh10", "swsh11", "swsh12", "swsh12pt5",
];

const POKEOS_RANGE = Array.from({ length: 60 }, (_, i) => i + 85); // 85–144

async function findPokeosSet(cardNumber: string): Promise<number[]> {
  const results = await Promise.all(
    POKEOS_RANGE.map(async (setId) => {
      try {
        const r = await fetch(
          `https://s3.pokeos.com/pokeos-uploads/tcg/textless/${setId}/${cardNumber}.jpg`,
          { method: "HEAD", cache: "no-store" }
        );
        return r.status === 200 ? setId : null;
      } catch { return null; }
    })
  );
  return results.filter((x): x is number => x !== null);
}

export async function GET() {
  const mapping: Record<string, { cardNumber: string; pokeosIds: number[] }> = {};

  await Promise.all(
    TCG_SETS_TO_PROBE.map(async (setId) => {
      try {
        const res = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=set.id:${setId} (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare")&pageSize=1&select=number,name,rarity`,
          { cache: "no-store" }
        );
        const data = await res.json();
        const card = data.data?.[0];
        if (!card) { mapping[setId] = { cardNumber: "none", pokeosIds: [] }; return; }
        const pokeosIds = await findPokeosSet(card.number);
        mapping[setId] = { cardNumber: card.number, pokeosIds };
      } catch {
        mapping[setId] = { cardNumber: "error", pokeosIds: [] };
      }
    })
  );

  return NextResponse.json(mapping);
}
