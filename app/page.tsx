import HexMenu from "@/components/HexMenu";

export default function Home() {
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #1a8fd1 0%, #0d5f9c 100%)" }}
    >
      <div className="relative z-10 flex flex-col items-center">
        <div className="pt-8 text-center">
          <h1 className="text-white text-2xl font-extrabold tracking-tight drop-shadow">Snomnom Dex</h1>
          <p className="text-blue-100/80 text-xs font-medium mt-1">Pick a section</p>
        </div>
        <HexMenu />
      </div>
    </div>
  );
}
