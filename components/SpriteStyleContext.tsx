"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SpriteStyle } from "@/lib/spriteStyle";

interface SpriteStyleCtx {
  style: SpriteStyle;
  setStyle: (s: SpriteStyle) => void;
}

const SpriteStyleContext = createContext<SpriteStyleCtx>({
  style: "pixel",
  setStyle: () => {},
});

export function SpriteStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = useState<SpriteStyle>("pixel");
  return (
    <SpriteStyleContext.Provider value={{ style, setStyle }}>
      {children}
    </SpriteStyleContext.Provider>
  );
}

export function useSpriteStyle() {
  return useContext(SpriteStyleContext);
}
