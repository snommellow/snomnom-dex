export const dynamic = "force-dynamic";

const CURRENT_MAP: Record<number, string> = {
  227: "Bulbasaur (1)",
  228: "Gloom (44)",
  229: "Rhydon (112)",
  230: "Charmander (4)",
  231: "Arcanine (59)",
  232: "Vaporeon (134)",
  233: "Gyarados (130)",
  234: "Lapras (131)",
  235: "Electrode (101)",
  236: "Charizard (6)",
  237: "Slowpoke (79)",
  238: "Diglett (50)",
  239: "Cubone (104)",
  240: "Nidoqueen (31)",
  241: "Wigglytuff (40)",
  242: "Golbat (42)",
  243: "??? (skipped)",
  244: "Dragonite (149)",
  245: "Blastoise (9)",
  246: "Meowth (52)",
  247: "Ditto (132)",
  248: "Eevee (133)",
  249: "Starmie (121)",
  250: "Snorlax (143)",
};

export default function DebugPocketPage() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless/384";

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-white text-2xl font-bold mb-2">PokéOS Set 384 — Pocket Cards 227–250</h1>
      <p className="text-gray-400 mb-6 text-sm">
        Current mapping shown below each card. Tell me which ones are wrong.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {Object.entries(CURRENT_MAP).map(([n, label]) => (
          <div key={n} className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${BASE}/${n}.png`}
              alt={`card ${n}`}
              className="w-28 rounded shadow-lg"
              style={{ background: "#1a1a2e" }}
            />
            <span className="text-yellow-300 text-xs font-bold">#{n}</span>
            <span className="text-white text-[10px] text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
