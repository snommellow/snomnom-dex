import { Suspense } from "react";
import PokedexGrid from "@/components/PokedexGrid";

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl bg-gray-100 animate-pulse h-44"
        />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-red-600 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white border-4 border-gray-800 shadow-inner flex-shrink-0" />
          <h1 className="text-white text-2xl font-bold tracking-tight">
            Snomnom Dex
          </h1>
          <span className="text-red-200 text-sm ml-auto">Generation I · 151 Pokémon</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Suspense fallback={<GridSkeleton />}>
          <PokedexGrid />
        </Suspense>
      </main>
    </div>
  );
}
