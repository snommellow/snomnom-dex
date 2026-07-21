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
      style={{ background: "linear-gradient(160deg, #2E3192 0%, #1a1c5c 50%, #12143f 100%)" }}
    >
      <header className="sticky top-0 z-20 shadow-lg" style={{ background: "linear-gradient(90deg,#1a1c5c 0%,#2E3192 50%,#1a1c5c 100%)" }}>
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
            <p className="text-indigo-200 text-[11px] font-medium leading-none mt-0.5">
              {trainers.length} Trainers &amp; Trainer Classes
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <TrainersClient trainers={trainers} />
      </main>
    </div>
  );
}
