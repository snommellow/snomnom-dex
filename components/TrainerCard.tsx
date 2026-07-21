"use client";

import Image from "next/image";
import type { TrainerEntry } from "@/lib/trainerapi";

interface Props {
  trainer: TrainerEntry;
  onSelect?: (trainer: TrainerEntry) => void;
}

export default function TrainerCard({ trainer, onSelect }: Props) {
  return (
    <article
      className="group cursor-pointer select-none h-full"
      onClick={() => onSelect?.(trainer)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(trainer); } : undefined}
    >
      <div className="rounded-xl overflow-hidden shadow-md bg-white/10 transition-transform duration-200 group-hover:scale-[1.04] group-hover:shadow-xl">
        <div className="relative aspect-[5/7] bg-black/20">
          <Image
            src={trainer.imageUrl}
            alt={trainer.name}
            fill
            sizes="(max-width: 640px) 45vw, 160px"
            className="object-cover"
            unoptimized
          />
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs font-bold text-white truncate">{trainer.name}</p>
    </article>
  );
}
