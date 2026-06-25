import { Suspense } from "react";
import PokedexGrid from "@/components/PokedexGrid";

export const dynamic = "force-dynamic";

function GridSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3">
        <div className="h-9 w-72 rounded-xl bg-amber-200/40 animate-pulse" />
        <div className="h-9 w-24 rounded-xl bg-amber-200/40 animate-pulse" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-6 w-16 rounded-full bg-amber-200/40 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="rounded-md bg-amber-200/40 animate-pulse h-44" />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* Wood-grain shelf background */}
      <div
        className="min-h-screen"
        style={{
          background: `
            repeating-linear-gradient(
              180deg,
              transparent 0px,
              transparent 58px,
              rgba(139,90,43,0.08) 58px,
              rgba(139,90,43,0.08) 60px
            ),
            linear-gradient(160deg, #c8955a 0%, #b5793a 30%, #c9904f 60%, #b87035 100%)
          `,
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 shadow-lg"
          style={{ background: "linear-gradient(90deg,#8b1a1a 0%,#c0392b 50%,#8b1a1a 100%)" }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            {/* Pokéball */}
            <div className="relative w-9 h-9 flex-shrink-0">
              <div className="w-9 h-9 rounded-full border-4 border-gray-900 bg-white overflow-hidden shadow-inner">
                <div className="w-full h-1/2 bg-red-500" />
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-gray-900" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-900 z-10" />
              </div>
            </div>

            <div>
              <h1 className="text-white text-xl font-extrabold tracking-tight leading-none drop-shadow">
                Snomnom Dex
              </h1>
              <p className="text-red-200 text-[11px] font-medium leading-none mt-0.5">
                Generation I · 151 Pokémon
              </p>
            </div>

          </div>
        </header>

        {/* Shelf trim — top edge below header */}
        <div
          className="h-3 shadow-md"
          style={{ background: "linear-gradient(180deg,#7a4a1e 0%,#a0622a 100%)" }}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Suspense fallback={<GridSkeleton />}>
            <PokedexGrid />
          </Suspense>
        </main>
      </div>
    </>
  );
}
