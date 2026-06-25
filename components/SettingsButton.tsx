"use client";

import { useState } from "react";
import { Settings, X } from "lucide-react";
import { SPRITE_OPTIONS, getSpriteUrl, PREVIEW_ID } from "@/lib/spriteStyle";
import { useSpriteStyle } from "./SpriteStyleContext";

export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const { style, setStyle } = useSpriteStyle();

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 border border-white/20 text-white/70 hover:text-white hover:border-white/50 transition-all"
      >
        <Settings size={16} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Modal */}
      {open && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[380px] max-w-[calc(100vw-32px)] bg-[#10101e] border border-[#252538] rounded-2xl p-5 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <Settings size={14} />
              Settings
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Sprite style section */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Sprite Style
            </p>
            <div className="flex gap-1.5">
              {SPRITE_OPTIONS.map((opt) => {
                const previewUrl = getSpriteUrl(PREVIEW_ID, opt.id);
                const active = style === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setStyle(opt.id)}
                    className={`flex flex-col items-center gap-1.5 flex-1 py-2 px-1 rounded-xl border text-[10px] font-semibold transition-all ${
                      active
                        ? "border-[#e8b820] text-[#e8b820] bg-[#e8b82010]"
                        : "border-[#252538] text-gray-500 bg-[#18182a] hover:border-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={opt.label}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-contain"
                      style={opt.pixelated ? { imageRendering: "pixelated" } : undefined}
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
