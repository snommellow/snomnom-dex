import { NextResponse } from "next/server";

export async function GET() {
  // Find Pidgey's IR card number in sv3pt5
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=name:"Pidgey" set.id:sv3pt5 rarity:"Illustration Rare"&pageSize=5&select=id,name,number,rarity`,
    { cache: "no-store" }
  );
  const data = await res.json();
  const cards = data.data ?? [];
  if (!cards.length) return NextResponse.json({ error: "No IR Pidgey found in sv3pt5" });

  const cardNumber = cards[0].number;

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
  return NextResponse.json({ cardNumber, found, all: results });
}
