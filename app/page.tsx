"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Player, generateBracket } from "@/lib/bracket";
import {
  getTournaments,
  saveTournament,
  deleteTournament,
  TournamentRecord,
  isDebugMode,
  setDebugMode,
} from "@/lib/db";
import { cn } from "@/lib/cn";

export default function Home() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([]);
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [seeds, setSeeds] = useState<Record<number, number>>({ 0: 1, 1: 2, 2: 3, 3: 4 });
  const [tournamentName, setTournamentName] = useState("");
  const [defaultFormat, setDefaultFormat] = useState<3 | 5>(3);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [debugMode, setDebugModeState] = useState(() => isDebugMode());
  const [loadingTournaments, setLoadingTournaments] = useState(true);

  const toggleDebug = (val: boolean) => {
    setDebugMode(val);
    setDebugModeState(val);
    getTournaments().then(setTournaments);
  };

  const isAdmin = !!user || debugMode;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    getTournaments().then((t) => { setTournaments(t); setLoadingTournaments(false); });
  }, []);

  const addPlayer = () => {
    setNames((n) => {
      const next = [...n, ""];
      setSeeds(s => ({ ...s, [next.length - 1]: next.length }));
      return next;
    });
  };
  const removePlayer = (i: number) => {
    setNames((n) => n.filter((_, idx) => idx !== i));
    setSeeds((s) => {
      const next: Record<number, number> = {};
      Object.entries(s).forEach(([k, v]) => {
        const ki = +k;
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      });
      return next;
    });
  };
  const updateName = (i: number, val: string) =>
    setNames((n) => n.map((v, idx) => (idx === i ? val : v)));

  const setSeed = (playerIdx: number, seed: number | undefined) => {
    setSeeds((s) => {
      const next = { ...s };
      if (seed) Object.keys(next).forEach((k) => { if (next[+k] === seed) delete next[+k]; });
      if (seed) next[playerIdx] = seed;
      else delete next[playerIdx];
      return next;
    });
  };

  const loadStub = (count: number) => {
    setNames(Array.from({ length: count }, (_, i) => `P${i + 1}`));
    setSeeds(Object.fromEntries(Array.from({ length: count }, (_, i) => [i, i + 1])));
  };

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  const start = () => {
    if (!isAdmin) return router.push("/login");
    const players: Player[] = names
      .map((name, i) => ({ id: `p${i}`, name: name.trim(), seed: seeds[i] }))
      .filter((p) => p.name);
    if (players.length < 3) return alert("NEED AT LEAST 3 PLAYERS");
    const id = crypto.randomUUID();
    const record: TournamentRecord = {
      id,
      name:
        tournamentName.trim() ||
        `Tournament ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      defaultFormat,
      state: generateBracket(players),
    };
    saveTournament(record).then(() => router.push(`/bracket/${id}`));
  };

  const handleCopy = (t: TournamentRecord) => {
    const players = t.state.players;
    setTournamentName(`Copy of ${t.name}`);
    setNames(players.map(p => p.name));
    setSeeds(Object.fromEntries(players.map((p, i) => [i, p.seed ?? i + 1])));
    setDefaultFormat(t.defaultFormat ?? 3);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleDelete = (id: string) => {
    deleteTournament(id).then(() => getTournaments().then(setTournaments));
    setConfirmDelete(null);
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-12 px-4">
      <div className="text-center mb-10">
        <div className="text-xs md:text-sm mb-1 text-[var(--text-dim)]">
          ── SUPER SMASH BROS. MELEE ──
        </div>
        <h1 className="text-5xl md:text-4xl font-bold tracking-widest glow">
          TOURNAMENT
        </h1>
        <div className="mt-2">
          {user
            ? <button onClick={logout} className="text-xs font-mono text-[var(--text-dim)] hover:text-[#e8001c] transition-colors">logout ({user.email})</button>
            : debugMode
              ? <span className="text-xs font-mono text-[#f0c000]">debug mode</span>
              : <button onClick={() => router.push("/login")} className="text-xs font-mono text-[var(--text-dim)] hover:text-[#39ff14] transition-colors">admin login</button>
          }
        </div>
        <div className="text-xs md:text-sm tracking-widest mt-1 text-[var(--text-dim)]">
          DOUBLE ELIMINATION BRACKET
        </div>
      </div>

      {/* Past tournaments */}
      {loadingTournaments ? (
        <div className="w-full max-w-md mb-8">
          <div className="text-sm mb-2 text-[var(--text-dim)]">&gt; TOURNAMENTS</div>
          <div className="text-sm font-mono text-[var(--text-dim)] animate-pulse">loading...</div>
        </div>
      ) : tournaments.length > 0 && (
        <div className="w-full max-w-md mb-8">
          <div className="text-sm mb-2 text-[var(--text-dim)]">
            &gt; TOURNAMENTS
          </div>
          <div className="space-y-1">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={t.state.champion ? `/bracket/${t.id}/results?skip=1` : `/bracket/${t.id}`}
                className="flex items-center gap-2 border border-[var(--border)] px-3 py-2 hover:border-[var(--text)] transition-colors"
              >
                <div className="flex-1 font-mono text-base text-[var(--text)]">
                  <span className="block">{t.name}</span>
                  <span className="text-xs text-[var(--text-dim)]">
                    {t.state.players.length}P ·{" "}
                    {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {(() => {
                  const status = t.state.champion ? "complete" : Object.values(t.state.matches).some(m => m.winner) ? "in_progress" : "not_started";
                  const cfg = {
                    complete:    { label: "★ COMPLETE",    color: "#f0c000" },
                    in_progress: { label: "● IN PROGRESS", color: "#39ff14" },
                    not_started: { label: "○ NOT STARTED", color: "var(--text-dim)" },
                  }[status];
                  return <span className="text-xs font-mono shrink-0" style={{ color: cfg.color }}>{cfg.label}</span>;
                })()}
                {isAdmin && (
                  <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
                    <button
                      onClick={() => handleCopy(t)}
                      className="text-sm text-[var(--text-dim)] hover:text-[#39ff14] transition-colors font-mono px-1 cursor-pointer"
                      title="Copy to new tournament"
                    >
                      ⎘
                    </button>
                    <button
                      onClick={() => setConfirmDelete(t.id)}
                      className="text-sm text-[var(--text-dim)] hover:text-[#e8001c] transition-colors font-mono px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isAdmin ? <>
      {/* New tournament */}
      <div ref={formRef} className="w-full max-w-md mb-5">
        <div className="text-sm mb-2 text-[var(--text-dim)]">
          &gt; NEW TOURNAMENT
        </div>
        <input
          className="w-full px-2 py-1.5 text-base mb-3"
          placeholder="Tournament name (optional)"
          value={tournamentName}
          onChange={(e) => setTournamentName(e.target.value)}
        />
        <div className="flex gap-2 items-center">
          <span className="text-sm text-[var(--text-dim)]">FORMAT:</span>
          {([3, 5] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDefaultFormat(f)}
              className={cn(
                "px-3 py-1 text-sm font-mono border transition-colors",
                defaultFormat === f
                  ? "border-[var(--text)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)]",
              )}
            >
              Bo{f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 w-full max-w-md">
        <div className="text-sm mb-2 text-[var(--text-dim)]">
          &gt; QUICK FILL:
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32].map((n) => (
            <button
              key={n}
              onClick={() => loadStub(n)}
              className="text-sm px-2 py-1 font-mono border border-[var(--border)] text-[var(--text-dim)] bg-transparent hover:border-[var(--text)] hover:text-[var(--text)] transition-colors"
            >
              {n}P
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-sm mb-1 text-(--text-dim)">&gt; ENTRANTS</div>

        {names.map((name, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-sm w-5 text-right text-[var(--text-dim)]">
              {i + 1}.
            </span>
            <input
              className="flex-1 px-2 py-1.5 text-base"
              placeholder={`Player ${i + 1}`}
              value={name}
              onChange={(e) => updateName(i, e.target.value)}
            />
            <input
              type="number"
              min={1}
              max={names.length}
              className="px-1 py-1.5 text-sm w-14 text-center"
              value={seeds[i] ?? ""}
              placeholder="#"
              onChange={(e) =>
                setSeed(i, e.target.value ? Number(e.target.value) : undefined)
              }
            />
            {names.length > 3 && (
              <button
                onClick={() => removePlayer(i)}
                className="text-sm text-[var(--text-dim)] font-mono"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addPlayer}
          className="w-full py-1.5 text-sm mt-1 font-mono border border-dashed border-[var(--border)] text-[var(--text-dim)] bg-transparent"
        >
          + ADD ENTRANT
        </button>

        <button
          onClick={start}
          className="w-full py-3 text-base font-bold tracking-widest mt-2 font-mono"
          style={{
            border: "1px solid #39ff14",
            color: "#000",
            background: "#39ff14",
            textShadow: "none",
            boxShadow: "0 0 16px #39ff14, 0 0 32px #1a5a0a",
          }}
        >
          ▶ START TOURNAMENT
        </button>
      </div>
      </> : (
        <div className="w-full max-w-md flex flex-col items-center">
          <img src="/melee-qr-bracket-300px.png" alt="QR Code" className="w-64 h-64 mb-16" />
        </div>
      )}

      <div className="mt-4 w-full max-w-md">
        <label className="flex items-center gap-2 text-xs font-mono text-[var(--text-dim)] cursor-pointer">
          <input type="checkbox" checked={debugMode} onChange={e => toggleDebug(e.target.checked)} />
          debug mode (localStorage, no auth)
        </label>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-6 max-w-sm w-full mx-4 font-mono">
            <div className="text-base tracking-widest font-bold text-[var(--text)] mb-3">
              ⚠ DELETE TOURNAMENT?
            </div>
            <div className="text-sm text-[var(--text-dim)] mb-6">
              {tournaments.find((t) => t.id === confirmDelete)?.name} — this
              cannot be undone.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2 text-sm tracking-widest font-bold text-black bg-[#e8001c] border border-[#e8001c] hover:opacity-80 transition-opacity"
              >
                DELETE
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm tracking-widest text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
