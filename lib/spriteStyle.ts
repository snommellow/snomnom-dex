const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

export type SpriteStyle = "gb" | "gen1" | "pixel" | "home" | "modern";

export interface SpriteOption {
  id: SpriteStyle;
  label: string;
  pixelated: boolean;
}

export const SPRITE_OPTIONS: SpriteOption[] = [
  { id: "gb",     label: "GB",     pixelated: true  },
  { id: "gen1",   label: "Gen 1",  pixelated: true  },
  { id: "pixel",  label: "Pixel",  pixelated: true  },
  { id: "home",   label: "Home",   pixelated: false },
  { id: "modern", label: "Modern", pixelated: false },
];

export function getSpriteUrl(id: number, style: SpriteStyle): string {
  switch (style) {
    case "gb":     return `${BASE}/versions/generation-i/yellow/gbc/${id}.png`;
    case "gen1":   return `${BASE}/versions/generation-i/red-blue/transparent/${id}.png`;
    case "pixel":  return `${BASE}/${id}.png`;
    case "home":   return `${BASE}/other/home/${id}.png`;
    case "modern": return `${BASE}/other/official-artwork/${id}.png`;
  }
}

// Eevee (133) used for previews, same as reference
export const PREVIEW_ID = 133;
