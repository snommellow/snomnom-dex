"use client";
export const dynamic = "force-dynamic";

export default function DebugPokeos461Page() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/461";
  const cards = Array.from({ length: 150 }, (_, i) => i + 1);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-white text-2xl font-bold mb-2">PokéOS Set 461 — Cards 1–150</h1>
      <p className="text-gray-400 mb-4 text-sm">
        Magnemite confirmed at #80. Broken images hide themselves.
      </p>
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-3">
        {cards.map((n) => (
          <div key={n} className="flex flex-col items-center gap-1" id={`c${n}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.jpg`}
              alt={`${n}`}
              className="w-20 rounded shadow-lg bg-gray-800"
              onError={(e) => {
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
