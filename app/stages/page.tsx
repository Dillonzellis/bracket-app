"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

const STARTERS = ["Battlefield", "Final Destination", "Pokémon Stadium", "Fountain of Dreams", "Yoshi's Story"];
const COUNTERPICKS = ["Dream Land 64", "Yoshi's Island Melee"];
const ALL_STAGES = [...STARTERS, ...COUNTERPICKS];

type Phase =
  | { type: "high_roll"; p1Roll: number | null; p2Roll: number | null }
  | { type: "g1_strike"; turn: 1 | 2; bansLeft: number; banned: string[] }
  | { type: "g1_result"; stage: string }
  | { type: "cp_ban"; loser: 1 | 2; bansLeft: number; banned: string[] }
  | { type: "cp_pick"; winner: 1 | 2; available: string[] }
  | { type: "cp_result"; stage: string };

type GameRecord = { stage: string; winner: 1 | 2 };

const P1_COLOR = "#4a9eff";
const P2_COLOR = "#ff8c42";

function playerColor(n: 1 | 2) { return n === 1 ? P1_COLOR : P2_COLOR; }

function SlotDisplay({ player, name, locked, value, tickerVal, winner, onRoll }: {
  player: 1 | 2; name: string; locked: boolean; value: number | null;
  tickerVal: number; winner: 1 | 2 | null; onRoll: () => void;
}) {
  const color = player === 1 ? P1_COLOR : P2_COLOR;
  const display = locked ? value : tickerVal;
  const isWinner = winner === player;
  const isLoser = winner !== null && winner !== player;
  return (
    <div className="flex-1 flex flex-col items-center gap-3">
      <div className="text-xs tracking-widest font-bold" style={{ color }}>{name}</div>
      <div className="w-full border-2 flex items-center justify-center relative overflow-hidden"
        style={{
          borderColor: isWinner ? "#39ff14" : isLoser ? "#333" : color,
          height: 96,
          background: locked ? `${color}11` : "transparent",
          boxShadow: isWinner ? `0 0 18px #39ff1466` : locked ? `0 0 10px ${color}44` : "none",
        }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)"
        }} />
        <span className="text-5xl font-bold tabular-nums" style={{
          color: isWinner ? "#39ff14" : isLoser ? "#444" : locked ? color : `${color}99`,
          textShadow: isWinner ? "0 0 12px #39ff14" : locked ? `0 0 8px ${color}` : "none",
        }}>
          {String(display ?? 0).padStart(2, "0")}
        </span>
      </div>
      <button disabled={locked} onClick={onRoll}
        className="w-full py-2.5 text-sm tracking-widest font-bold border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: locked ? "#333" : color, color: locked ? "#555" : color }}>
        {locked ? "LOCKED" : "▶ ROLL"}
      </button>
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

  const cpBans = 2;

  const [phase, setPhase] = useState<Phase>({ type: "high_roll", p1Roll: null, p2Roll: null });
  const [games, setGames] = useState<GameRecord[]>([]);
  const [gameNum, setGameNum] = useState(1);
  const [ticker, setTicker] = useState<{ p1: number; p2: number }>({ p1: 0, p2: 0 });
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase.type !== "high_roll") { if (tickerRef.current) clearInterval(tickerRef.current); return; }
    tickerRef.current = setInterval(() => {
      setTicker({ p1: Math.floor(Math.random() * 99) + 1, p2: Math.floor(Math.random() * 99) + 1 });
    }, 80);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
  }, [phase.type]);

  function roll(player: 1 | 2) {
    if (phase.type !== "high_roll") return;
    if (player === 1 && phase.p1Roll !== null) return;
    if (player === 2 && phase.p2Roll !== null) return;
    const val = Math.floor(Math.random() * 99) + 1;
    const next = player === 1
      ? { ...phase, p1Roll: val }
      : { ...phase, p2Roll: val };
    // Check tie after both rolled
    const p1 = player === 1 ? val : phase.p1Roll;
    const p2 = player === 2 ? val : phase.p2Roll;
    if (p1 !== null && p2 !== null && p1 === p2) {
      setTimeout(() => setPhase({ type: "high_roll", p1Roll: null, p2Roll: null }), 1200);
    }
    setPhase(next);
  }

  function startStriking(first: 1 | 2) {
    setPhase({ type: "g1_strike", turn: first, bansLeft: 2, banned: [] });
  }

  const p1Wins = games.filter(g => g.winner === 1).length;
  const p2Wins = games.filter(g => g.winner === 2).length;
  const winsNeeded = Math.ceil(format / 2);
  const matchOver = p1Wins >= winsNeeded || p2Wins >= winsNeeded;

  function playerName(n: 1 | 2) { return n === 1 ? p1Name : p2Name; }

  function banStage(stage: string) {
    if (phase.type !== "g1_strike" && phase.type !== "cp_ban") return;
    const newBanned = [...phase.banned, stage];
    const newBansLeft = phase.bansLeft - 1;

    if (phase.type === "g1_strike") {
      if (newBansLeft > 0) {
        // Same player still has bans
        setPhase({ type: "g1_strike", turn: phase.turn, bansLeft: newBansLeft, banned: newBanned });
      } else if (phase.turn === 1) {
        // P1 done banning 2, now P2 bans 2
        setPhase({ type: "g1_strike", turn: 2, bansLeft: 2, banned: newBanned });
      } else {
        // P2 done, 1 stage remains
        const remaining = STARTERS.filter(s => !newBanned.includes(s));
        setPhase({ type: "g1_result", stage: remaining[0] });
      }
    } else {
      // cp_ban
      if (newBansLeft > 0) {
        setPhase({ ...phase, bansLeft: newBansLeft, banned: newBanned });
      } else {
        const available = ALL_STAGES.filter(s => !newBanned.includes(s));
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
    // Start counterpick: loser bans
    setPhase({ type: "cp_ban", loser: winner === 1 ? 2 : 1, bansLeft: cpBans, banned: [] });
  }

  function reset() {
    setPhase({ type: "high_roll", p1Roll: null, p2Roll: null });
    setGames([]);
    setGameNum(1);
  }

  const banned = (phase.type === "g1_strike" || phase.type === "cp_ban") ? phase.banned : [];
  const available = phase.type === "cp_pick" ? phase.available : null;
  const activePlayer: 1 | 2 | null =
    phase.type === "g1_strike" ? phase.turn :
    phase.type === "cp_ban" ? phase.loser :
    phase.type === "cp_pick" ? phase.winner : null;

  if (phase.type === "high_roll") {
    const bothRolled = phase.p1Roll !== null && phase.p2Roll !== null;
    const tie = bothRolled && phase.p1Roll === phase.p2Roll;
    const winner: 1 | 2 | null = bothRolled && !tie ? (phase.p1Roll! > phase.p2Roll! ? 1 : 2) : null;

    return (
      <main className="min-h-screen flex flex-col items-center py-10 px-4 font-mono">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => router.back()} className="text-sm tracking-widest text-[var(--text)] hover:text-[#39ff14] transition-colors">◀ BACK</button>
            <span className="text-sm tracking-widest text-[var(--text-dim)] flex-1 text-center">STAGE STRIKING · Bo{format}</span>
          </div>

          <div className="text-center text-xs tracking-widest text-[var(--text-dim)] mb-6">HIGH ROLL STRIKES FIRST</div>

          <div className="flex gap-4 mb-6">
            <SlotDisplay player={1} name={p1Name} locked={phase.p1Roll !== null} value={phase.p1Roll} tickerVal={ticker.p1} winner={winner} onRoll={() => roll(1)} />
            <SlotDisplay player={2} name={p2Name} locked={phase.p2Roll !== null} value={phase.p2Roll} tickerVal={ticker.p2} winner={winner} onRoll={() => roll(2)} />
          </div>

          {tie && (
            <div className="text-center text-sm tracking-widest text-[#f0c000] mb-4 animate-pulse">TIE — RE-ROLLING...</div>
          )}

          {winner && (
            <div className="mb-6 text-center">
              <div className="text-xs text-[var(--text-dim)] mb-2 tracking-widest">RESULT</div>
              <div className="text-xl font-bold tracking-widest mb-4" style={{ color: playerColor(winner) }}>
                {playerName(winner)} STRIKES FIRST
              </div>
              <button onClick={() => startStriking(winner)}
                className="w-full py-3 text-base tracking-widest font-bold"
                style={{ background: playerColor(winner), border: `2px solid ${playerColor(winner)}`, color: "#000" }}>
                ▶ START STRIKING
              </button>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-5 space-y-4">
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
              {phase.type === "g1_strike" && `${playerName(phase.turn)} BANS ${phase.bansLeft} STAGE${phase.bansLeft > 1 ? "S" : ""}`}
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
                  return (
                    <button key={stage}
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
