"use client";
export const dynamic = "force-dynamic";

export default function DebugPokeos110Page() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/110";
  const cards = Array.from({ length: 80 }, (_, i) => i + 165);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-white text-2xl font-bold mb-2">PokéOS Set 110 — Cards 165–244</h1>
      <p className="text-gray-400 mb-4 text-sm">Pidgeot confirmed at #207. Missing images hide themselves.</p>
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-3">
        {cards.map((n) => (
          <div key={n} className="flex flex-col items-center gap-1" id={`c${n}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.jpg`}
              alt={`${n}`}
              className="w-20 rounded shadow-lg bg-gray-800"
              onError={() => {
                const el = document.getElementById(`c${n}`);
                if (el) el.style.display = "none";
              }}
            />
            <span className="text-yellow-300 text-[10px] font-bold">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
