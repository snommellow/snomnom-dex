import { NextResponse } from "next/server";

export async function GET() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/384";
  const cards = [];
  for (let n = 227; n <= 250; n++) {
    cards.push({ n, url: `${BASE}/${n}.png` });
  }
  return NextResponse.json({ cards });
}
