"use client";

import Image from "next/image";
import { UserCircle } from "lucide-react";
import type { TrainerEntry } from "@/lib/trainerapi";

interface Props {
  trainer: TrainerEntry;
  onSelect?: (trainer: TrainerEntry) => void;
}

export default function TrainerCard({ trainer, onSelect }: Props) {
  return (
    <article
      className="group cursor-pointer select-none h-full flex flex-col items-center"
      onClick={() => onSelect?.(trainer)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(trainer); } : undefined}
    >
      <div className="w-full rounded-xl overflow-hidden shadow-md border-2 border-amber-800/20 bg-amber-100/40 transition-transform duration-200 group-hover:scale-[1.04] group-hover:shadow-xl">
        <div className="relative aspect-[3/4] bg-amber-900/10 flex items-center justify-center">
          {trainer.imageUrl ? (
            <Image
              src={trainer.imageUrl}
              alt={trainer.name}
              fill
              sizes="(max-width: 640px) 45vw, 140px"
              className="object-cover"
            />
          ) : (
            <UserCircle size={48} strokeWidth={1.25} className="text-amber-800/30" />
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs font-bold text-amber-950 truncate w-full">{trainer.name}</p>
    </article>
  );
}
