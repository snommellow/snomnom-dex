"use client";

import Link from "next/link";
import {
  Boxes, HelpCircle, Wind, Globe, Shield, Briefcase,
  Hexagon, Leaf, UserCircle, Paintbrush, Settings, type LucideIcon,
} from "lucide-react";

const ITEMS: { label: string; href: string; icon: LucideIcon; color: string }[] = [
  { label: "Pokédex", href: "/pokedex", icon: Hexagon, color: "#E8491D" },
  { label: "PC", href: "/pc", icon: Boxes, color: "#29ABE2" },
  { label: "Who's That", href: "/who-is-that", icon: HelpCircle, color: "#5FC7E8" },
  { label: "Moves", href: "/moves", icon: Wind, color: "#F5A623" },
  { label: "Locations", href: "/locations", icon: Globe, color: "#2ECC9B" },
  { label: "Abilities", href: "/abilities", icon: Shield, color: "#E8491D" },
  { label: "Bag", href: "/bag", icon: Briefcase, color: "#F4B400" },
  { label: "Types", href: "/types", icon: Hexagon, color: "#C724B1" },
  { label: "Natures", href: "/natures", icon: Leaf, color: "#4CAF50" },
  { label: "Trainers", href: "/trainers", icon: UserCircle, color: "#2E3192" },
  { label: "Themes", href: "/themes", icon: Paintbrush, color: "#8E44AD" },
  { label: "Settings", href: "/settings", icon: Settings, color: "#757575" },
];

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

export default function HexMenu() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-8 max-w-2xl mx-auto py-10 px-6">
      {ITEMS.map(({ label, href, icon: Icon, color }) => (
        <Link key={href} href={href} className="flex flex-col items-center gap-2 group">
          <div
            className="w-full aspect-square max-w-[120px] flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 group-active:scale-95"
            style={{
              clipPath: HEX_CLIP,
              background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, black))`,
              border: "3px solid rgba(255,255,255,0.5)",
            }}
          >
            <Icon size={36} className="text-white" strokeWidth={2} />
          </div>
          <span className="text-white text-xs font-black uppercase tracking-wide text-center drop-shadow">
            {label}
          </span>
        </Link>
      ))}
    </div>
  );
}
