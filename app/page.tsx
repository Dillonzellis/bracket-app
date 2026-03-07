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

  const updateSeed = (i: number, val: string) => {
    const num = parseInt(val);
    setSeeds((s) => {
      const next = { ...s };
      // Remove any existing assignment for this seed number
      Object.keys(next).forEach((k) => {
        if (next[+k] === num) delete next[+k];
      });
      if (val && num >= 1 && num <= 3) next[i] = num;
      else delete next[i];
      return next;
    });
  };

  const loadStub = (count: number) => {
    const stubs = Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
    setNames(stubs);
    setSeeds({ 0: 1, 1: 2, 2: 3 });
  };

  const start = () => {
    const players: Player[] = names
      .map((name, i) => ({ id: `p${i}`, name: name.trim(), seed: seeds[i] }))
      .filter((p) => p.name);

    if (players.length < 3) return alert("Need at least 3 players");

    localStorage.setItem("bracket-players", JSON.stringify(players));
    router.push("/bracket");
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-16 px-4">
      <h1 className="text-4xl font-bold mb-2 tracking-tight">Double Elimination</h1>
      <p className="text-gray-400 mb-10">Enter players and optionally assign seeds 1–3</p>

      <div className="flex gap-2 mb-6 flex-wrap justify-center">
        {[3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32].map((n) => (
          <button
            key={n}
            onClick={() => loadStub(n)}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded transition"
          >
            {n} players
          </button>
        ))}
      </div>

      <div className="w-full max-w-md space-y-3">
        {names.map((name, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder={`Player ${i + 1}`}
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={seeds[i] ?? ""}
              onChange={(e) => updateSeed(i, e.target.value)}
            >
              <option value="">—</option>
              <option value="1">Seed 1</option>
              <option value="2">Seed 2</option>
              <option value="3">Seed 3</option>
            </select>
            {names.length > 3 && (
              <button
                onClick={() => removePlayer(i)}
                className="text-gray-500 hover:text-red-400 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addPlayer}
          className="w-full border border-dashed border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white rounded py-2 text-sm transition"
        >
          + Add Player
        </button>

        <button
          onClick={start}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded py-2.5 transition mt-2"
        >
          Generate Bracket
        </button>
      </div>
    </main>
  );
}
