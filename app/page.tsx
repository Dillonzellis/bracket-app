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
      Object.keys(next).forEach((k) => { if (next[+k] === num) delete next[+k]; });
      if (val && num >= 1 && num <= 3) next[i] = num;
      else delete next[i];
      return next;
    });
  };

  const loadStub = (count: number) => {
    setNames(Array.from({ length: count }, (_, i) => `PLAYER_${String(i + 1).padStart(2, "0")}`));
    setSeeds({ 0: 1, 1: 2, 2: 3 });
  };

  const start = () => {
    const players: Player[] = names
      .map((name, i) => ({ id: `p${i}`, name: name.trim(), seed: seeds[i] }))
      .filter((p) => p.name);
    if (players.length < 3) return alert("ERROR: MINIMUM 3 PLAYERS REQUIRED");
    localStorage.setItem("bracket-players", JSON.stringify(players));
    router.push("/bracket");
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-xs mb-2" style={{ color: "var(--green-dim)" }}>
          ══════════════════════════════════
        </div>
        <h1 className="text-4xl font-bold tracking-widest glow mb-1">
          BRACKET SYS
        </h1>
        <div className="text-xs tracking-widest" style={{ color: "var(--green-dim)" }}>
          DOUBLE ELIMINATION v1.0
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--green-dim)" }}>
          ══════════════════════════════════
        </div>
      </div>

      {/* Quick load */}
      <div className="mb-6 w-full max-w-md">
        <div className="text-xs mb-2" style={{ color: "var(--green-dim)" }}>
          &gt; QUICK LOAD:
        </div>
        <div className="flex gap-2 flex-wrap">
          {[3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32].map((n) => (
            <button
              key={n}
              onClick={() => loadStub(n)}
              className="text-xs px-2 py-1 transition"
              style={{
                border: "1px solid var(--green-dim)",
                color: "var(--green-dim)",
                background: "transparent",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = "var(--green)";
                (e.target as HTMLElement).style.borderColor = "var(--green)";
                (e.target as HTMLElement).style.boxShadow = "0 0 6px var(--green-dim)";
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = "var(--green-dim)";
                (e.target as HTMLElement).style.borderColor = "var(--green-dim)";
                (e.target as HTMLElement).style.boxShadow = "none";
              }}
            >
              [{n}P]
            </button>
          ))}
        </div>
      </div>

      {/* Player list */}
      <div className="w-full max-w-md space-y-2">
        <div className="text-xs mb-2" style={{ color: "var(--green-dim)" }}>
          &gt; ENTER COMPETITORS:
        </div>
        {names.map((name, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs w-6 text-right" style={{ color: "var(--green-dim)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <input
              className="flex-1 px-2 py-1.5 text-sm"
              placeholder={`PLAYER_${String(i + 1).padStart(2, "0")}`}
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            <select
              className="px-2 py-1.5 text-xs"
              value={seeds[i] ?? ""}
              onChange={(e) => updateSeed(i, e.target.value)}
            >
              <option value="">--</option>
              <option value="1">S1</option>
              <option value="2">S2</option>
              <option value="3">S3</option>
            </select>
            {names.length > 3 && (
              <button
                onClick={() => removePlayer(i)}
                className="text-sm w-5"
                style={{ color: "var(--green-dim)", fontFamily: "inherit" }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addPlayer}
          className="w-full py-1.5 text-xs mt-1 transition"
          style={{
            border: "1px dashed var(--green-dim)",
            color: "var(--green-dim)",
            background: "transparent",
            fontFamily: "inherit",
          }}
        >
          + ADD PLAYER
        </button>

        <button
          onClick={start}
          className="w-full py-2.5 text-sm font-bold tracking-widest mt-2 transition"
          style={{
            border: "1px solid var(--green)",
            color: "var(--bg)",
            background: "var(--green)",
            fontFamily: "inherit",
            textShadow: "none",
            boxShadow: "0 0 12px var(--green), 0 0 24px var(--green-dim)",
          }}
        >
          ▶ GENERATE BRACKET
        </button>
      </div>
    </main>
  );
}
