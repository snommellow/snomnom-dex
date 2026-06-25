export const dynamic = "force-dynamic";

export default function DebugPocketPage() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/384";
  const cards = Array.from({ length: 24 }, (_, i) => i + 227);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-white text-2xl font-bold mb-6">
        PokéOS Set 384 — Cards 227–250
      </h1>
      <p className="text-gray-400 mb-6 text-sm">
        Identify each card by name and fill in the mapping below.
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
        {cards.map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.png`}
              alt={`card ${n}`}
              className="w-24 rounded shadow-lg"
              style={{ background: "#1a1a2e" }}
            />
            <span className="text-yellow-300 text-xs font-bold">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
