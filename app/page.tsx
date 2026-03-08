"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Player } from "@/lib/bracket";

export default function Home() {
  const router = useRouter();
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [seeds, setSeeds] = useState<Record<number, number>>({});

  const addPlayer = () => setNames((n) => [...n, ""]);
  const removePlayer = (i: number) => setNames((n) => n.filter((_, idx) => idx !== i));
  const updateName = (i: number, val: string) =>
    setNames((n) => n.map((v, idx) => (idx === i ? val : v)));

  const setSeed = (playerIdx: number, seed: number | undefined) => {
    setSeeds((s) => {
      const next = { ...s };
      // Clear any other player that had this seed
      if (seed) Object.keys(next).forEach((k) => { if (next[+k] === seed) delete next[+k]; });
      if (seed) next[playerIdx] = seed;
      else delete next[playerIdx];
      return next;
    });
  };

  const loadStub = (count: number) => {
    setNames(Array.from({ length: count }, (_, i) => `P${i + 1}`));
    setSeeds({ 0: 1, 1: 2, 2: 3 });
  };

  const start = () => {
    const players: Player[] = names
      .map((name, i) => ({ id: `p${i}`, name: name.trim(), seed: seeds[i] }))
      .filter((p) => p.name);
    if (players.length < 3) return alert("NEED AT LEAST 3 PLAYERS");
    localStorage.setItem("bracket-players", JSON.stringify(players));
    router.push("/bracket");
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">

      {/* GCN controller SVG decoration */}
      <div className="mb-6 opacity-30">
        <svg width="120" height="60" viewBox="0 0 120 60">
          <ellipse cx="60" cy="38" rx="55" ry="22" fill="#3b1a5a" stroke="#7b2fbe" strokeWidth="1.5"/>
          <ellipse cx="18" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1"/>
          <ellipse cx="102" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1"/>
          <rect x="28" y="30" width="5" height="14" rx="1" fill="#7b2fbe"/>
          <rect x="24" y="34" width="13" height="5" rx="1" fill="#7b2fbe"/>
          <circle cx="82" cy="32" r="7" fill="#00c846" opacity="0.8"/>
          <text x="82" y="36" textAnchor="middle" fontSize="8" fill="#000" fontWeight="bold">A</text>
          <circle cx="70" cy="40" r="5" fill="#e8001c" opacity="0.8"/>
          <text x="70" y="44" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold">B</text>
          <circle cx="92" cy="40" r="5" fill="#8888ff" opacity="0.8"/>
          <text x="92" y="44" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold">X</text>
          <circle cx="82" cy="48" r="4" fill="#888" opacity="0.8"/>
          <text x="82" y="51" textAnchor="middle" fontSize="6" fill="#fff" fontWeight="bold">Y</text>
          <circle cx="68" cy="22" r="6" fill="#f0c000" opacity="0.6"/>
          <text x="68" y="26" textAnchor="middle" fontSize="6" fill="#000" fontWeight="bold">C</text>
          <circle cx="44" cy="24" r="8" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1"/>
          <circle cx="44" cy="24" r="4" fill="#7b2fbe" opacity="0.5"/>
          <circle cx="60" cy="30" r="4" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1"/>
          <text x="60" y="33" textAnchor="middle" fontSize="5" fill="#7b2fbe">ST</text>
        </svg>
      </div>

      {/* Title */}
      <div className="text-center mb-8">
        <div className="text-xs md:text-sm mb-1 text-[var(--text-dim)]">── SUPER SMASH BROS. MELEE ──</div>
        <h1 className="text-5xl md:text-4xl font-bold tracking-widest glow">TOURNAMENT</h1>
        <div className="text-xs md:text-sm tracking-widest mt-1 text-[var(--text-dim)]">DOUBLE ELIMINATION BRACKET</div>
      </div>

      {/* Quick load */}
      <div className="mb-5 w-full max-w-md">
        <div className="text-sm mb-2 text-[var(--text-dim)]">&gt; QUICK FILL:</div>
        <div className="flex gap-1.5 flex-wrap">
          {[3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32].map((n) => (
            <button key={n} onClick={() => loadStub(n)}
              className="text-sm px-2 py-1 font-mono border border-[var(--border)] text-[var(--text-dim)] bg-transparent hover:border-[var(--text)] hover:text-[var(--text)] transition-colors">
              {n}P
            </button>
          ))}
        </div>
      </div>

      {/* Player list */}
      <div className="w-full max-w-md space-y-2">
        <div className="text-sm mb-1 text-[var(--text-dim)]">&gt; ENTRANTS</div>

        {names.map((name, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-sm w-5 text-right text-[var(--text-dim)]">{i + 1}.</span>
            <input
              className="flex-1 px-2 py-1.5 text-base"
              placeholder={`Player ${i + 1}`}
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            <select
              className="px-1 py-1.5 text-sm w-20"
              value={seeds[i] ?? ""}
              onChange={(e) => setSeed(i, e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">seed</option>
              <option value="1">1st</option>
              <option value="2">2nd</option>
              <option value="3">3rd</option>
            </select>
            {names.length > 3 && (
              <button onClick={() => removePlayer(i)} className="text-sm text-[var(--text-dim)] font-mono">✕</button>
            )}
          </div>
        ))}

        <button onClick={addPlayer} className="w-full py-1.5 text-sm mt-1 font-mono border border-dashed border-[var(--border)] text-[var(--text-dim)] bg-transparent">
          + ADD ENTRANT
        </button>

        <button onClick={start} className="w-full py-3 text-base font-bold tracking-widest mt-2 font-mono"
          style={{
            border: "1px solid #39ff14",
            color: "#000", background: "#39ff14",
            textShadow: "none",
            boxShadow: "0 0 16px #39ff14, 0 0 32px #1a5a0a",
          }}>
          ▶ START TOURNAMENT
        </button>
      </div>
    </main>
  );
}
