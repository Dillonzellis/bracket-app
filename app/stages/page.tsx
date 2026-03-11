"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const STARTERS = ["Battlefield", "Final Destination", "Fountain of Dreams", "Yoshi's Story", "Dream Land 64"];
const COUNTERPICKS = ["Pokémon Stadium"];
const ALL_STAGES = [...STARTERS, ...COUNTERPICKS];

type Phase =
  | { type: "stock_roll"; stocks: (1 | 2 | null)[]; running: boolean; winner: 1 | 2 | null; tie: boolean }
  | { type: "g1_strike"; striker: 1 | 2; step: 0 | 1 | 2; banned: string[] }
  | { type: "g1_result"; stage: string }
  | { type: "cp_ban"; loser: 1 | 2; bansLeft: number; banned: string[] }
  | { type: "cp_pick"; winner: 1 | 2; available: string[] }
  | { type: "cp_result"; stage: string };

type GameRecord = { stage: string; winner: 1 | 2 };

const P1_COLOR = "#4a9eff";
const P2_COLOR = "#ff8c42";

function playerColor(n: 1 | 2) { return n === 1 ? P1_COLOR : P2_COLOR; }

// ── Mini match animation ──────────────────────────────────────────────────────
type MatchState = {
  p1x: number; p2x: number;          // 0–100 % across arena
  p1stocks: number; p2stocks: number;
  flash: 1 | 2 | null;               // which player just got hit
  shake: boolean;
  p1fly: boolean; p2fly: boolean;    // loser flies off
  done: boolean;
  winner: 1 | 2 | null;
};

const INIT_MATCH: MatchState = {
  p1x: 15, p2x: 85, p1stocks: 2, p2stocks: 2,
  flash: null, shake: false, p1fly: false, p2fly: false,
  done: false, winner: null,
};

function MiniMatch({ p1Name, p2Name, onWinner }: {
  p1Name: string; p2Name: string; onWinner: (w: 1 | 2) => void;
}) {
  const [ms, setMs] = useState<MatchState>(INIT_MATCH);
  const [started, setStarted] = useState(false);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedule(fn: () => void, delay: number) {
    rafRef.current = setTimeout(fn, delay);
  }

  function runMatch() {
    setStarted(true);
    // True 50/50: pick winner first, then build elimination order around it
    const winner: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
    const loser: 1 | 2 = winner === 1 ? 2 : 1;
    // loser loses both stocks, winner loses 1 stock (randomly positioned in sequence)
    const loserStocks = loser === 1 ? [0, 1] : [2, 3];
    const winnerStock = winner === 1 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 2 : 3);
    const elimOrder = [...loserStocks, winnerStock].sort(() => Math.random() - 0.5);
    const owners: (1 | 2)[] = [1, 1, 2, 2];

    let t = 0;

    // Slide together
    t += 50;
    schedule(() => setMs(s => ({ ...s, p1x: 35, p2x: 65 })), t);

    // Each elimination
    elimOrder.forEach((stockOwnerIdx, i) => {
      const hitPlayer = owners[stockOwnerIdx];
      const hitter = hitPlayer === 1 ? 2 : 1;

      t += 600 + Math.random() * 400;
      const tHit = t;
      schedule(() => {
        setMs(s => ({
          ...s,
          flash: hitPlayer,
          shake: true,
          p1stocks: hitPlayer === 1 ? s.p1stocks - 1 : s.p1stocks,
          p2stocks: hitPlayer === 2 ? s.p2stocks - 1 : s.p2stocks,
          // bounce hitter forward, victim back
          p1x: hitter === 1 ? Math.min(s.p1x + 8, 45) : Math.max(s.p1x - 12, 5),
          p2x: hitter === 2 ? Math.max(s.p2x - 8, 55) : Math.min(s.p2x + 12, 95),
        }));
      }, tHit);

      t += 300;
      schedule(() => {
        setMs(s => ({
          ...s, flash: null, shake: false,
          // drift back toward center
          p1x: 35, p2x: 65,
        }));
      }, t);
    });

    // Final blow — loser flies off
    t += 600;
    schedule(() => {
      setMs(s => ({
        ...s,
        flash: winner === 1 ? 2 : 1,
        shake: true,
        p1stocks: winner === 2 ? 0 : s.p1stocks,
        p2stocks: winner === 1 ? 0 : s.p2stocks,
        p1fly: winner === 2,
        p2fly: winner === 1,
        p1x: winner === 2 ? -30 : s.p1x,
        p2x: winner === 1 ? 130 : s.p2x,
      }));
    }, t);

    t += 500;
    schedule(() => {
      setMs(s => ({ ...s, flash: null, shake: false, done: true, winner }));
      onWinner(winner);
    }, t);
  }

  useEffect(() => () => { if (rafRef.current) clearTimeout(rafRef.current); }, []);

  const p1color = P1_COLOR;
  const p2color = P2_COLOR;

  return (
    <div className={cn("select-none", ms.shake && "animate-[shake_0.15s_ease-in-out]")}
      style={{ ['--shake' as string]: '4px' }}>
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        @keyframes stockpop { 0%{transform:scale(1.6);opacity:1} 100%{transform:scale(0);opacity:0} }
      `}</style>

      {/* Stock bars */}
      <div className="flex justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold tracking-widest" style={{ color: p1color }}>{p1Name}</span>
          <div className="flex gap-1">
            {[0,1].map(i => (
              <div key={i} className="w-3 h-3 rounded-full border transition-all duration-200"
                style={{
                  borderColor: ms.p1stocks > i ? p1color : '#333',
                  background: ms.p1stocks > i ? p1color : 'transparent',
                  boxShadow: ms.p1stocks > i ? `0 0 6px ${p1color}` : 'none',
                  animation: ms.flash === 1 && ms.p1stocks === i ? 'stockpop 0.3s forwards' : 'none',
                }} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {[0,1].map(i => (
              <div key={i} className="w-3 h-3 rounded-full border transition-all duration-200"
                style={{
                  borderColor: ms.p2stocks > i ? p2color : '#333',
                  background: ms.p2stocks > i ? p2color : 'transparent',
                  boxShadow: ms.p2stocks > i ? `0 0 6px ${p2color}` : 'none',
                  animation: ms.flash === 2 && ms.p2stocks === i ? 'stockpop 0.3s forwards' : 'none',
                }} />
            ))}
          </div>
          <span className="text-xs font-bold tracking-widest" style={{ color: p2color }}>{p2Name}</span>
        </div>
      </div>

      {/* Arena */}
      <div className="relative border border-[var(--border)] overflow-hidden mb-4"
        style={{ height: 120, background: '#0a0a0a' }}>
        {/* Platform */}
        <div className="absolute bottom-6 left-[10%] right-[10%] h-1 bg-[var(--border)]" />

        {/* P1 character */}
        <div className="absolute transition-all duration-500 ease-in-out"
          style={{
            left: `${ms.p1x}%`,
            bottom: 28,
            transform: 'translateX(-50%)',
            transition: ms.p1fly ? 'left 0.4s ease-in, bottom 0.4s ease-in' : 'left 0.5s ease-in-out',
          }}>
          <div className="w-8 h-10 flex flex-col items-center gap-0.5">
            {/* head */}
            <div className="w-5 h-5 rounded-full border-2 transition-all duration-150"
              style={{
                borderColor: p1color,
                background: ms.flash === 1 ? '#fff' : `${p1color}33`,
                boxShadow: ms.flash === 1 ? `0 0 12px #fff` : `0 0 6px ${p1color}66`,
              }} />
            {/* body */}
            <div className="w-6 h-5 border-2 transition-all duration-150"
              style={{
                borderColor: p1color,
                background: ms.flash === 1 ? '#fff' : `${p1color}22`,
              }} />
          </div>
        </div>

        {/* P2 character */}
        <div className="absolute transition-all duration-500 ease-in-out"
          style={{
            left: `${ms.p2x}%`,
            bottom: 28,
            transform: 'translateX(-50%)',
            transition: ms.p2fly ? 'left 0.4s ease-in, bottom 0.4s ease-in' : 'left 0.5s ease-in-out',
          }}>
          <div className="w-8 h-10 flex flex-col items-center gap-0.5">
            <div className="w-5 h-5 rounded-full border-2 transition-all duration-150"
              style={{
                borderColor: p2color,
                background: ms.flash === 2 ? '#fff' : `${p2color}33`,
                boxShadow: ms.flash === 2 ? `0 0 12px #fff` : `0 0 6px ${p2color}66`,
              }} />
            <div className="w-6 h-5 border-2 transition-all duration-150"
              style={{
                borderColor: p2color,
                background: ms.flash === 2 ? '#fff' : `${p2color}22`,
              }} />
          </div>
        </div>

        {/* Hit flash overlay */}
        {ms.flash && (
          <div className="absolute inset-0 pointer-events-none transition-opacity duration-100"
            style={{ background: `${playerColor(ms.flash)}18` }} />
        )}
      </div>

      {!started && (
        <button onClick={runMatch}
          className="w-full py-3 text-base tracking-widest font-bold border-2 border-[var(--border)] text-[var(--text)] hover:border-[#f0c000] hover:text-[#f0c000] transition-colors">
          ▶ FIGHT
        </button>
      )}

      {started && !ms.done && (
        <div className="text-center text-xs tracking-widest text-[var(--text-dim)] animate-pulse py-3">FIGHTING...</div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function Stock({ owner, alive, dim }: { owner: 1 | 2; alive: boolean; dim: boolean }) {
  const color = owner === 1 ? P1_COLOR : P2_COLOR;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-300"
        style={{
          borderColor: alive ? color : "#333",
          background: alive ? `${color}22` : "transparent",
          opacity: dim ? 0.25 : alive ? 1 : 0.15,
          boxShadow: alive && !dim ? `0 0 12px ${color}66` : "none",
        }}
      >
        <span className="text-lg font-bold" style={{ color: alive ? color : "#333" }}>●</span>
      </div>
    </div>
  );
}

function StrikePage() {
  const router = useRouter();
  const params = useSearchParams();
  const format = params.get("format") === "5" ? 5 : 3;
  const p1Name = params.get("p1") || "Player 1";
  const p2Name = params.get("p2") || "Player 2";
  const returnTo = params.get("returnTo") ?? null;

  const cpBans = format === 3 ? 1 : 0;

  const [phase, setPhase] = useState<Phase>({ type: "stock_roll", stocks: [1, 1, 2, 2], running: false, winner: null, tie: false });
  const [games, setGames] = useState<GameRecord[]>([]);
  const [gameNum, setGameNum] = useState(1);
  function runStockRoll() {
    if (phase.type !== "stock_roll" || phase.running) return;
    // Shuffle elimination order for all 4 stocks, last one wins
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const owners: (1 | 2)[] = [1, 1, 2, 2];
    setPhase(p => p.type === "stock_roll" ? { ...p, running: true, stocks: [1, 1, 2, 2], winner: null, tie: false } : p);
    let delay = 0;
    order.slice(0, 3).forEach((stockIdx, i) => {
      delay += 400 + Math.random() * 500;
      const d = delay;
      setTimeout(() => {
        setPhase(p => {
          if (p.type !== "stock_roll") return p;
          const next = [...p.stocks] as (1 | 2 | null)[];
          next[stockIdx] = null;
          // After 3rd elimination, determine winner
          if (i === 2) {
            const lastIdx = order[3];
            const winner = owners[lastIdx];
            // Check if last two eliminated were same player (tie = both players lost last stock simultaneously isn't possible here, but check if winner's other stock was already gone)
            return { ...p, stocks: next, running: false, winner };
          }
          return { ...p, stocks: next };
        });
      }, d);
    });
  }

  function startStriking(first: 1 | 2) {
    setPhase({ type: "g1_strike", striker: first, step: 0, banned: [] });
  }

  const p1Wins = games.filter(g => g.winner === 1).length;
  const p2Wins = games.filter(g => g.winner === 2).length;
  const winsNeeded = Math.ceil(format / 2);
  const matchOver = p1Wins >= winsNeeded || p2Wins >= winsNeeded;

  function playerName(n: 1 | 2) { return n === 1 ? p1Name : p2Name; }

  // G1 strike pattern: step 0 = striker bans 1, step 1 = other bans 2 (two clicks), step 2 = striker bans 1 → done
  function banStage(stage: string) {
    if (phase.type !== "g1_strike" && phase.type !== "cp_ban") return;
    const newBanned = [...phase.banned, stage];

    if (phase.type === "g1_strike") {
      const { striker, step } = phase;
      const other: 1 | 2 = striker === 1 ? 2 : 1;
      if (step === 0) {
        // striker just banned 1, now other bans 2 (step 1, need 2 bans)
        setPhase({ type: "g1_strike", striker, step: 1, banned: newBanned });
      } else if (step === 1 && newBanned.length < 3) {
        // other still has 1 more ban
        setPhase({ type: "g1_strike", striker, step: 1, banned: newBanned });
      } else if (step === 1) {
        // other done with 2 bans, back to striker for final ban (step 2)
        setPhase({ type: "g1_strike", striker, step: 2, banned: newBanned });
      } else {
        // step 2: striker's final ban, 1 stage remains
        const remaining = STARTERS.filter(s => !newBanned.includes(s));
        setPhase({ type: "g1_result", stage: remaining[0] });
      }
    } else {
      // cp_ban
      const newBansLeft = phase.bansLeft - 1;
      if (newBansLeft > 0) {
        setPhase({ ...phase, bansLeft: newBansLeft, banned: newBanned });
      } else {
        const available = ALL_STAGES.filter(s => !newBanned.includes(s));
        // loser of the game (not the banner) picks
        setPhase({ type: "cp_pick", winner: phase.loser === 1 ? 2 : 1, available });
      }
    }
  }

  function pickStage(stage: string) {
    if (phase.type !== "cp_pick") return;
    setPhase({ type: "cp_result", stage });
  }

  function reportWinner(winner: 1 | 2) {
    const stage = phase.type === "g1_result" ? phase.stage : phase.type === "cp_result" ? phase.stage : "";
    const newGames = [...games, { stage, winner }];
    setGames(newGames);
    const newG = gameNum + 1;
    setGameNum(newG);
    const newP1 = newGames.filter(g => g.winner === 1).length;
    const newP2 = newGames.filter(g => g.winner === 2).length;
    if (newP1 >= winsNeeded || newP2 >= winsNeeded) {
      setPhase({ type: "cp_result", stage }); // stay on result, matchOver will show winner
      return;
    }
    // Start counterpick: if Bo5 no bans, go straight to pick
    const loser: 1 | 2 = winner === 1 ? 2 : 1;
    if (cpBans === 0) {
      setPhase({ type: "cp_pick", winner: loser, available: ALL_STAGES });
    } else {
      // Bo3: winner bans 1, then loser picks
      setPhase({ type: "cp_ban", loser: winner, bansLeft: cpBans, banned: [] });
    }
  }

  function reset() {
    setPhase({ type: "stock_roll", stocks: [1, 1, 2, 2], running: false, winner: null, tie: false });
    setGames([]);
    setGameNum(1);
  }

  const banned = (phase.type === "g1_strike" || phase.type === "cp_ban") ? phase.banned : [];
  const available = phase.type === "cp_pick" ? phase.available : null;
  // During g1_strike: step 0 or 2 = striker acts, step 1 = other acts
  const g1ActivePlayer: 1 | 2 | null = phase.type === "g1_strike"
    ? (phase.step === 1 ? (phase.striker === 1 ? 2 : 1) : phase.striker)
    : null;
  const activePlayer: 1 | 2 | null =
    phase.type === "g1_strike" ? g1ActivePlayer :
    phase.type === "cp_ban" ? phase.loser :
    phase.type === "cp_pick" ? phase.winner : null;

  if (phase.type === "stock_roll") {
    return (
      <main className="min-h-screen flex flex-col items-center py-10 px-4 font-mono">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => router.back()} className="text-sm tracking-widest text-[var(--text)] hover:text-[#39ff14] transition-colors">◀ BACK</button>
            <span className="text-sm tracking-widest text-[var(--text-dim)] flex-1 text-center">STAGE STRIKING · Bo{format}</span>
          </div>

          <div className="text-center text-xs tracking-widest text-[var(--text-dim)] mb-4">WINNER STRIKES FIRST</div>

          <MiniMatch
            p1Name={p1Name}
            p2Name={p2Name}
            onWinner={w => setPhase(p => p.type === "stock_roll" ? { ...p, winner: w, running: false } : p)}
          />

          {phase.winner && (
            <div className="mt-6 text-center">
              <div className="text-xl font-bold tracking-widest mb-4" style={{ color: playerColor(phase.winner), textShadow: `0 0 10px ${playerColor(phase.winner)}` }}>
                {playerName(phase.winner)} STRIKES FIRST
              </div>
              <button onClick={() => startStriking(phase.winner!)}
                className="w-full py-3 text-base tracking-widest font-bold mb-3"
                style={{ background: playerColor(phase.winner), border: `2px solid ${playerColor(phase.winner)}`, color: "#000" }}>
                ▶ START STRIKING
              </button>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-5 mt-6 space-y-4">
            <button onClick={() => { setGameNum(1); setPhase({ type: "g1_result", stage: "Battlefield" }); }}
              className="w-full py-2 text-sm tracking-widest border border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] transition-colors">
              ⚔ START ON BATTLEFIELD
            </button>
            <div>
              <div className="text-xs text-[var(--text-dim)] mb-3 tracking-widest text-center">— OR CHOOSE WHO STRIKES FIRST —</div>
              <div className="flex gap-3">
                <button onClick={() => startStriking(1)}
                  className="flex-1 py-2 text-sm tracking-widest border font-bold transition-colors"
                  style={{ borderColor: P1_COLOR, color: P1_COLOR }}>
                  {p1Name} FIRST
                </button>
                <button onClick={() => startStriking(2)}
                  className="flex-1 py-2 text-sm tracking-widest border font-bold transition-colors"
                  style={{ borderColor: P2_COLOR, color: P2_COLOR }}>
                  {p2Name} FIRST
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-4 font-mono">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-sm tracking-widest text-[var(--text)] hover:text-[#39ff14] transition-colors">◀ BACK</button>
          <span className="text-sm tracking-widest text-[var(--text-dim)] flex-1 text-center">STAGE STRIKING · Bo{format}</span>
          <button onClick={reset} className="text-xs tracking-widest text-[var(--text-dim)] hover:text-[#e8001c] transition-colors">RESET</button>
        </div>

        {/* Score */}
        <div className="flex items-center justify-between mb-6 border border-[var(--border)] px-4 py-3">
          <div className="text-center flex-1">
            <div className="text-xs mb-1 font-bold tracking-wide flex items-center justify-center gap-1.5"
              style={{ color: activePlayer === 1 ? P1_COLOR : "var(--text-dim)" }}>
              {activePlayer === 1 && <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P1_COLOR }} />}
              {p1Name}
            </div>
            <div className="text-3xl font-bold" style={{ color: p1Wins >= winsNeeded && matchOver ? "#39ff14" : "var(--text)" }}>{p1Wins}</div>
          </div>
          <div className="text-[var(--text-dim)] text-lg">–</div>
          <div className="text-center flex-1">
            <div className="text-xs mb-1 font-bold tracking-wide flex items-center justify-center gap-1.5"
              style={{ color: activePlayer === 2 ? P2_COLOR : "var(--text-dim)" }}>
              {activePlayer === 2 && <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P2_COLOR }} />}
              {p2Name}
            </div>
            <div className="text-3xl font-bold" style={{ color: p2Wins >= winsNeeded && matchOver ? "#39ff14" : "var(--text)" }}>{p2Wins}</div>
          </div>
        </div>

        {/* Game log */}
        {games.length > 0 && (
          <div className="mb-5 space-y-1">
            {games.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-[var(--text-dim)] border border-[var(--border)] px-3 py-1.5">
                <span>Game {i + 1} · {g.stage}</span>
                <span style={{ color: "#39ff14" }}>{playerName(g.winner)} wins</span>
              </div>
            ))}
          </div>
        )}

        {matchOver ? (
          <div className="text-center py-6">
            <div className="text-xl tracking-widest font-bold mb-4" style={{ color: "#39ff14", textShadow: "0 0 10px #39ff14" }}>
              ★ {playerName(p1Wins >= winsNeeded ? 1 : 2)} WINS
            </div>
            <div className="flex gap-3 justify-center">
              {returnTo && (
                <button
                  onClick={() => {
                    sessionStorage.setItem("stageResults", JSON.stringify(games.map(g => ({ winner: g.winner === 1 ? "p1" : "p2" }))));
                    router.push(returnTo);
                  }}
                  className="px-6 py-2 text-sm tracking-widest border border-[#39ff14] text-[#39ff14] hover:opacity-80 transition-opacity">
                  ← USE RESULTS
                </button>
              )}
              <button onClick={reset} className="px-6 py-2 text-sm tracking-widest border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--text)] transition-colors">
                NEW MATCH
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Instruction */}
            <div className="text-sm mb-3 tracking-widest font-bold"
              style={{ color: activePlayer ? playerColor(activePlayer) : "var(--text-dim)" }}>
              {phase.type === "g1_strike" && (() => {
                const actor = phase.step === 1 ? (phase.striker === 1 ? 2 : 1) : phase.striker;
                const bansLeft = phase.step === 0 ? 1 : phase.step === 1 ? (3 - phase.banned.length) : 1;
                return `${playerName(actor)} BANS ${bansLeft} STAGE${bansLeft > 1 ? "S" : ""}`;
              })()}
              {phase.type === "g1_result" && `GAME 1 — PLAY ON:`}
              {phase.type === "cp_ban" && `${playerName(phase.loser)} BANS ${phase.bansLeft} STAGE${phase.bansLeft > 1 ? "S" : ""}`}
              {phase.type === "cp_pick" && `${playerName(phase.winner)} PICKS STAGE`}
              {phase.type === "cp_result" && `GAME ${gameNum} — PLAY ON:`}
            </div>

            {/* Stage result */}
            {(phase.type === "g1_result" || phase.type === "cp_result") && (
              <div className="mb-5">
                <div className="border border-[#39ff14] px-4 py-4 text-center text-lg font-bold tracking-widest text-[#39ff14] mb-4"
                  style={{ textShadow: "0 0 8px #39ff14" }}>
                  {phase.stage}
                </div>
                <div className="text-xs text-[var(--text-dim)] mb-2 tracking-widest">WHO WON GAME {gameNum}?</div>
                <div className="flex gap-3">
                  {([1, 2] as const).map(p => (
                    <button key={p} onClick={() => reportWinner(p)}
                      className="flex-1 py-2 text-sm tracking-widest border border-[var(--border)] text-[var(--text)] hover:border-[#39ff14] hover:text-[#39ff14] transition-colors">
                      {playerName(p)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stage grid */}
            {(phase.type === "g1_strike" || phase.type === "cp_ban" || phase.type === "cp_pick") && (
              <div className="space-y-2">
                {(phase.type === "g1_strike" ? STARTERS : ALL_STAGES).map(stage => {
                  const isBanned = banned.includes(stage);
                  const isAvailable = available ? available.includes(stage) : !isBanned;
                  const isStarter = STARTERS.includes(stage);
                  // Dave's Stupid Rule: picker can't pick a stage they already won on
                  const pickerWonHere = phase.type === "cp_pick" &&
                    games.some(g => g.stage === stage && g.winner === phase.winner);
                  return (
                    <div key={stage}>
                    <button
                      disabled={isBanned || (available !== null && !isAvailable)}
                      onClick={() => phase.type === "cp_pick" ? pickStage(stage) : banStage(stage)}
                      style={(!isBanned && isAvailable && activePlayer) ? {
                        ['--hover-color' as string]: playerColor(activePlayer)
                      } : undefined}
                      className={cn(
                        "w-full px-4 py-3 text-left text-sm tracking-wide border transition-colors flex items-center justify-between",
                        isBanned && "opacity-30 line-through border-[var(--border)] text-[var(--text-dim)] cursor-not-allowed",
                        !isBanned && isAvailable && "border-[var(--border)] text-[var(--text)] hover:opacity-80",
                        !isBanned && !isAvailable && "opacity-30 border-[var(--border)] text-[var(--text-dim)] cursor-not-allowed",
                      )}
                      onMouseEnter={e => { if (!isBanned && isAvailable && activePlayer) { (e.currentTarget as HTMLElement).style.borderColor = playerColor(activePlayer); (e.currentTarget as HTMLElement).style.color = playerColor(activePlayer); } }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ""; (e.currentTarget as HTMLElement).style.color = ""; }}
                    >
                      <span>{stage}</span>
                      <span className="text-xs text-[var(--text-dim)]">{isStarter ? "STARTER" : "CP"}</span>
                    </button>
                    {pickerWonHere && (
                      <div className="text-xs text-[#f0c000] px-1 pt-0.5">⚠ Dave's Stupid Rule — {playerName(phase.winner)} already won on {stage}</div>
                    )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function StagesPage() {
  return <Suspense><StrikePage /></Suspense>;
}
