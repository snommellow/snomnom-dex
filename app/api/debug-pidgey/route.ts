import { NextResponse } from "next/server";

export async function GET() {
  // Find Pidgey's IR card number in sv3pt5
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=name:"Pidgey" (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare")&pageSize=20&select=id,name,number,rarity,set`,
    { cache: "no-store" }
  );
  const data = await res.json();
  const cards = data.data ?? [];
  if (!cards.length) return NextResponse.json({ error: "No IR Pidgey found anywhere", raw: data });

  const cardNumber = cards[0].number;
  const cardSetId = cards[0].set?.id;

  // Probe set IDs 95–130 for this card number
  const setIds = Array.from({ length: 36 }, (_, i) => i + 95);
  const results = await Promise.all(
    setIds.map(async (setId) => {
      const url = `https://s3.pokeos.com/pokeos-uploads/tcg/textless/${setId}/${cardNumber}.jpg`;
      const r = await fetch(url, { method: "HEAD", cache: "no-store" });
      return { setId, status: r.status };
    })
  );

  const found = results.filter((r) => r.status === 200);
  return NextResponse.json({ cards, cardNumber, cardSetId, found, all: results });
}
