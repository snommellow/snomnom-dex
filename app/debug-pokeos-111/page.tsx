export const dynamic = "force-dynamic";

export default function DebugPokeos111Page() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/111";
  // sv3pt5 (151 set) goes up to ~207. Show a wide range to find all cards.
  const cards = Array.from({ length: 80 }, (_, i) => i + 165);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-white text-2xl font-bold mb-2">PokéOS Set 111 — cards 165–244</h1>
      <p className="text-gray-400 mb-6 text-sm">
        Charizard confirmed at 199. Images that 404 will show broken. Identify each valid card.
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
        {cards.map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.jpg`}
              alt={`card ${n}`}
              className="w-24 rounded shadow-lg bg-gray-800"
            />
            <span className="text-yellow-300 text-xs font-bold">{n}</span>
          </div>
        ))}
      </div>

      <h2 className="text-white text-xl font-bold mt-10 mb-4">Cards 1–80 (base set cards)</h2>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
        {Array.from({ length: 80 }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.jpg`}
              alt={`card ${n}`}
              className="w-24 rounded shadow-lg bg-gray-800"
            />
            <span className="text-yellow-300 text-xs font-bold">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
