import { Suspense } from "react";
import PokedexGrid from "@/components/PokedexGrid";
import { SpriteStyleProvider } from "@/components/SpriteStyleContext";
import SettingsButton from "@/components/SettingsButton";

function GridSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3">
        <div className="h-9 w-72 rounded-xl bg-gray-200 animate-pulse" />
        <div className="h-9 w-24 rounded-xl bg-gray-200 animate-pulse" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-gray-100 animate-pulse h-48" />
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <SpriteStyleProvider>
      <div className="min-h-screen bg-[#f5f5f0]">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-red-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            {/* Pokéball icon */}
            <div className="relative w-9 h-9 flex-shrink-0">
              <div className="w-9 h-9 rounded-full border-4 border-gray-900 bg-white overflow-hidden shadow-inner">
                <div className="w-full h-1/2 bg-red-500" />
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-gray-900" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-900 z-10" />
              </div>
            </div>

            <div>
              <h1 className="text-white text-xl font-extrabold tracking-tight leading-none">
                Snomnom Dex
              </h1>
              <p className="text-red-200 text-[11px] font-medium leading-none mt-0.5">
                Generation I · 151 Pokémon
              </p>
            </div>

            {/* Settings button — top right */}
            <div className="ml-auto">
              <SettingsButton />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Suspense fallback={<GridSkeleton />}>
            <PokedexGrid />
          </Suspense>
        </main>
      </div>
    </SpriteStyleProvider>
  );
}
