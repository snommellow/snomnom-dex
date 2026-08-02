import fs from "fs";
import path from "path";
import Link from "next/link";
import { ArrowLeft, UserCircle } from "lucide-react";
import type { TrainerEntry } from "@/lib/trainerapi";
import TrainersClient from "@/components/TrainersClient";
import ComingSoon from "@/components/ComingSoon";

export const dynamic = "force-dynamic";

export default function TrainersPage() {
  const staticPath = path.join(process.cwd(), "lib/trainer-data.json");
  if (!fs.existsSync(staticPath)) {
    return <ComingSoon title="Trainers" icon={UserCircle} color="#2E3192" />;
  }
  const trainers = JSON.parse(fs.readFileSync(staticPath, "utf-8")) as TrainerEntry[];

  return (
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
      <header
        className="sticky top-0 z-20 shadow-lg"
        style={{ background: "linear-gradient(90deg,#8b1a1a 0%,#c0392b 50%,#8b1a1a 100%)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors flex-shrink-0"
            title="Back to menu"
          >
            <ArrowLeft size={16} />
          </Link>
          <UserCircle size={30} className="text-white flex-shrink-0" />
          <div>
            <h1 className="text-white text-xl font-extrabold tracking-tight leading-none drop-shadow">Trainers</h1>
            <p className="text-red-200 text-[11px] font-medium leading-none mt-0.5">
              {trainers.length} Trainers · Kanto &amp; Universal
            </p>
          </div>
        </div>
      </header>

      <div
        className="h-3 shadow-md"
        style={{ background: "linear-gradient(180deg,#7a4a1e 0%,#a0622a 100%)" }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <TrainersClient trainers={trainers} />
      </main>
    </div>
  );
}
