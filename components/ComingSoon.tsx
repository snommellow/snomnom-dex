import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export default function ComingSoon({ title, icon: Icon, color }: { title: string; icon: LucideIcon; color: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #1a2a4a 0%, #0f1c33 100%)" }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-lg"
          style={{ background: color }}
        >
          <Icon size={44} className="text-white" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-white text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-blue-200/70 text-sm font-medium mt-1">Coming soon.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to menu
        </Link>
      </div>
    </div>
  );
}
