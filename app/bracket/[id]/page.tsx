"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { BracketState, Match, Game, reportResult, undoResult, countAffectedMatches, findByeSlots, addPlayerToSlot, addPlayerToLosers, resolvePlayer } from "@/lib/bracket";
import { getTournament, saveTournament, TournamentRecord } from "@/lib/db";
import { cn } from "@/lib/cn";
import MatchPanel from "./MatchPanel";

const MATCH_W = 280;
const MATCH_H = 120;
const COL_GAP = 72;
const SECTION_GAP = 96;

function colX(ri: number) { return ri * (MATCH_W + COL_GAP); }
function sectionH(n: number) { return Math.max(n, 1) * MATCH_H + Math.max(n - 1, 0) * 56; }
function cardY(totalH: number, count: number, mi: number) {
  const sh = totalH / count;
  return sh * mi + (sh - MATCH_H) / 2;
}
function midY(totalH: number, count: number, mi: number) {
  return cardY(totalH, count, mi) + MATCH_H / 2;
}

function SeedBadge({ seed }: { seed: number }) {
  return <span className="text-xs text-[var(--text-dim)] ml-1.5 shrink-0">[{seed}]</span>;
}

export default function BracketPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TournamentRecord | null>(null);

  useEffect(() => {
    const t = getTournament(id);
    if (!t) { router.push("/"); return; }
    setTimeout(() => setRecord(t), 0);
  }, [id, router]);

  const [zoom, setZoom] = useState(1);
  const [confirmUndo, setConfirmUndo] = useState<{ matchId: string; description: string } | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [lateEntry, setLateEntry] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateSlot, setLateSlot] = useState("");

  const update = (newState: BracketState) => {
    if (!record) return;
    const updated = { ...record, state: newState };
    setRecord(updated);
    saveTournament(updated);
  };

  const handleWin = (matchId: string, winnerId: string, games: Game[], format: 3 | 5) => {
    if (!record) return;
    const next = JSON.parse(JSON.stringify(record.state)) as BracketState;
    const match = next.matches[matchId];
    if (match) { match.games = games; match.format = format; }
    update(reportResult(next, matchId, winnerId));
    setActiveMatchId(null);
  };

  const handleUndo = (matchId: string) => {
    if (!record) return;
    const match = record.state.matches[matchId];
    const affected = countAffectedMatches(record.state, matchId);
    const desc = `Reset ${match.winner!.name} def. ${match.loser?.name ?? "TBD"}` +
      (affected > 0 ? ` — also clears ${affected} downstream match${affected > 1 ? "es" : ""}` : "");
    setActiveMatchId(null);
    setConfirmUndo({ matchId, description: desc });
  };

  const confirmAndUndo = () => {
    if (!confirmUndo || !record) return;
    update(undoResult(record.state, confirmUndo.matchId));
    setConfirmUndo(null);
  };

  const handleLateEntry = () => {
    if (!record || !lateName.trim()) return;
    const byeSlots = findByeSlots(record.state);
    if (byeSlots.length > 0) {
      if (!lateSlot) return;
      const [matchId, slot] = lateSlot.split("|") as [string, "p1" | "p2"];
      update(addPlayerToSlot(record.state, matchId, slot, { id: "", name: lateName.trim() }));
    } else {
      update(addPlayerToLosers(record.state, { id: "", name: lateName.trim() }));
    }
    setLateName(""); setLateSlot(""); setLateEntry(false);
  };

  if (!record) return null;

  const state = record.state;
  const gf = state.matches[state.grandFinalsId];
  const wRounds = state.winnersRounds;
  const lRounds = state.losersRounds;

  const wH = sectionH(wRounds[0]?.length ?? 1);
  const lH = sectionH(lRounds[0]?.length ?? 1);
  const numCols = Math.max(wRounds.length, lRounds.length);
  const gfColX = colX(numCols);
  const totalW = gfColX + MATCH_W + 24;
  const totalH = wH + SECTION_GAP + lH;
  const wOffsetY = 0;
  const lOffsetY = wH + SECTION_GAP;
  const gfY = totalH / 2 - MATCH_H / 2;

  const paths: { d: string; color: string }[] = [];
  const addPath = (x1: number, y1: number, mx: number, y2: number, x2: number, color: string) =>
    paths.push({ d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, color });

  for (let ri = 0; ri < wRounds.length - 1; ri++) {
    const count = wRounds[ri].length;
    const nextCount = wRounds[ri + 1].length;
    const cx = colX(ri);
    for (let mi = 0; mi < count; mi++)
      addPath(cx + MATCH_W, wOffsetY + midY(wH, count, mi), cx + MATCH_W + COL_GAP / 2,
        wOffsetY + midY(wH, nextCount, Math.floor(mi / 2)), colX(ri + 1), "#1a3a1a");
  }
  for (let ri = 0; ri < lRounds.length - 1; ri++) {
    const count = lRounds[ri].length;
    const nextCount = lRounds[ri + 1].length;
    const cx = colX(ri);
    for (let mi = 0; mi < count; mi++)
      addPath(cx + MATCH_W, lOffsetY + midY(lH, count, mi), cx + MATCH_W + COL_GAP / 2,
        lOffsetY + midY(lH, nextCount, Math.floor(mi / 2)), colX(ri + 1), "#3d0820");
  }
  if (wRounds.length > 0) {
    const cx = colX(wRounds.length - 1);
    addPath(cx + MATCH_W, wOffsetY + midY(wH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + MATCH_H / 4, gfColX, "#1a3a1a");
  }
  if (lRounds.length > 0) {
    const cx = colX(lRounds.length - 1);
    addPath(cx + MATCH_W, lOffsetY + midY(lH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + (MATCH_H * 3) / 4, gfColX, "#3d0820");
  }

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="flex items-center gap-4 px-5 py-5 border-b border-[var(--border)]">
        <button onClick={() => router.push("/")}
          className="text-lg tracking-widest font-mono text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">
          ◀ MENU
        </button>
        <svg width="32" height="16" viewBox="0 0 120 60" className="opacity-50">
          <ellipse cx="60" cy="38" rx="55" ry="22" fill="#3b1a5a" stroke="#7b2fbe" strokeWidth="2"/>
          <ellipse cx="18" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
          <ellipse cx="102" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
          <circle cx="82" cy="32" r="7" fill="#00c846"/>
          <circle cx="70" cy="40" r="5" fill="#e8001c"/>
          <circle cx="92" cy="40" r="5" fill="#8888ff"/>
          <circle cx="44" cy="24" r="8" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
        </svg>
        <span className="text-xl tracking-widest glow text-[var(--text)]">{record.name}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))}
            className="w-7 h-7 flex items-center justify-center font-mono text-base text-[var(--text-dim)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">−</button>
          <button onClick={() => setZoom(1)}
            className="px-2 h-7 font-mono text-xs text-[var(--text-dim)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}
            className="w-7 h-7 flex items-center justify-center font-mono text-base text-[var(--text-dim)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">+</button>
        </div>
        <button onClick={() => setLateEntry(true)}
          className="text-sm tracking-widest font-mono text-[var(--text-dim)] hover:text-[var(--text)] transition-colors border border-[var(--border)] px-3 py-1 hover:border-[var(--text)]">
          + LATE ENTRY
        </button>
      </div>

      {state.champion && (
        <div className="text-center py-3 border-b border-[var(--border)] bg-[#1a0a2e]">
          <span className="text-lg tracking-widest font-bold text-[#f0c000]"
            style={{ textShadow: "0 0 10px #f0c000, 0 0 24px rgba(240,192,0,0.4)" }}>
            ★ GRAND CHAMPION: {state.champion.name} ★
          </span>
        </div>
      )}

      <div className="overflow-x-auto p-6 pt-16">
        <div style={{ width: totalW * zoom, height: (totalH + 36) * zoom }}>
        <div className="relative origin-top-left" style={{ width: totalW, height: totalH + 36, transform: `scale(${zoom})` }}>
          <div className="absolute text-lg tracking-widest font-bold text-[var(--text)] glow"
            style={{ top: wOffsetY, left: 0, transform: "translateY(-22px)" }}>▸ WINNERS BRACKET</div>
          <div className="absolute text-base tracking-widest font-bold text-[#e8001c]"
            style={{ top: lOffsetY, left: 0, transform: "translateY(-22px)", textShadow: "0 0 8px #e8001c" }}>▸ LOSERS BRACKET</div>
          <div className="absolute text-base tracking-widest font-bold text-center text-[#f0c000]"
            style={{ left: gfColX, top: gfY - 24, width: MATCH_W, textShadow: "0 0 8px #f0c000" }}>★ GRAND FINALS</div>

          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 36}>
            {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />)}
          </svg>

          {wRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-base text-center text-[var(--text-dim)]"
                  style={{ left: cx, top: wOffsetY - 20, width: MATCH_W }}>R{ri + 1}</div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: wOffsetY + cardY(wH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onOpen={setActiveMatchId}
                      winnerColor="#39ff14" borderColor="#1a3a1a" />
                  </div>
                ))}
              </div>
            );
          })}

          {lRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`l${ri}`}>
                <div className="absolute text-base text-center text-[var(--text-dim)]"
                  style={{ left: cx, top: lOffsetY - 20, width: MATCH_W }}>R{ri + 1}</div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: lOffsetY + cardY(lH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onOpen={setActiveMatchId}
                      winnerColor="#e8001c" borderColor="#3d0820" />
                  </div>
                ))}
              </div>
            );
          })}

          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state} onOpen={setActiveMatchId}
                winnerColor="#f0c000" borderColor="#3d3000" />
            </div>
          )}
        </div>
        </div>
      </div>

      {activeMatchId && record && (() => {
        const match = state.matches[activeMatchId];
        const wc = match.bracket === "winners" ? "#39ff14" : match.bracket === "losers" ? "#e8001c" : "#f0c000";
        return (
          <MatchPanel
            match={match}
            state={state}
            defaultFormat={record.defaultFormat ?? 3}
            winnerColor={wc}
            onConfirm={handleWin}
            onUndo={handleUndo}
            onClose={() => setActiveMatchId(null)}
          />
        );
      })()}

      {lateEntry && (() => {
        const byeSlots = findByeSlots(state);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] p-6 max-w-sm w-full mx-4 font-mono">
              <div className="text-base tracking-widest font-bold text-[var(--text)] mb-3">+ LATE ENTRY</div>
              <input className="w-full px-2 py-2 text-base mb-3" placeholder="Player name"
                value={lateName} onChange={e => setLateName(e.target.value)} autoFocus />
              {byeSlots.length > 0 ? (
                <select className="w-full px-2 py-2 text-sm mb-3" value={lateSlot} onChange={e => setLateSlot(e.target.value)}>
                  <option value="">Select open bye slot…</option>
                  {byeSlots.map(({ matchId, slot }) => (
                    <option key={`${matchId}|${slot}`} value={`${matchId}|${slot}`}>
                      {matchId} — {slot === "p1" ? "top" : "bottom"} slot
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-[#e8001c] mb-3">
                  No bye slots available — player will be placed directly into losers bracket.
                </div>
              )}
              <div className="flex gap-3 mt-3">
                <button onClick={handleLateEntry}
                  disabled={!lateName.trim() || (byeSlots.length > 0 && !lateSlot)}
                  className="flex-1 py-2 text-sm tracking-widest font-bold text-black bg-[#39ff14] border border-[#39ff14] disabled:opacity-40 hover:opacity-80 transition-opacity">
                  ADD
                </button>
                <button onClick={() => { setLateEntry(false); setLateName(""); setLateSlot(""); }}
                  className="flex-1 py-2 text-sm tracking-widest text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] transition-colors">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmUndo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] p-6 max-w-sm w-full mx-4 font-mono">
            <div className="text-base tracking-widest font-bold text-[var(--text)] mb-3">⚠ UNDO RESULT?</div>
            <div className="text-sm text-[var(--text-dim)] mb-6">{confirmUndo.description}</div>
            <div className="flex gap-3">
              <button onClick={confirmAndUndo}
                className="flex-1 py-2 text-sm tracking-widest font-bold text-black bg-[#e8001c] border border-[#e8001c] hover:opacity-80 transition-opacity">
                UNDO
              </button>
              <button onClick={() => setConfirmUndo(null)}
                className="flex-1 py-2 text-sm tracking-widest text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--text)] transition-colors">
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MatchCard({ match, state, onOpen, winnerColor, borderColor }: {
  match: Match; state: BracketState;
  onOpen: (id: string) => void;
  winnerColor: string; borderColor: string;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const hasResult = !!match.winner;
  const p1Wins = match.games?.filter(g => g.winner === "p1").length ?? 0;
  const p2Wins = match.games?.filter(g => g.winner === "p2").length ?? 0;

  return (
    <div className="relative overflow-hidden bg-[var(--bg-card)] cursor-pointer"
      onClick={() => onOpen(match.id)}
      style={{
        width: MATCH_W, height: MATCH_H,
        border: `1px solid ${hasResult ? winnerColor : borderColor}`,
        boxShadow: hasResult ? `0 0 10px ${winnerColor}33` : "none",
      }}>
      {([p1, p2] as const).map((player, i) => {
        const isWinner = match.winner?.id === player?.id;
        const isLoser = match.loser?.id === player?.id;
        const gameScore = match.games ? (i === 0 ? p1Wins : p2Wins) : null;
        return (
          <div key={i}
            className={cn(
              "w-full flex items-center justify-between px-2 font-mono text-base tracking-wide",
              isLoser && "line-through"
            )}
            style={{
              height: MATCH_H / 2,
              borderBottom: i === 0 ? `1px solid ${borderColor}` : "none",
              background: isWinner ? `${winnerColor}20` : "transparent",
              color: isWinner ? winnerColor : isLoser ? "var(--text-dim)" : "var(--text)",
              textShadow: isWinner ? `0 0 6px ${winnerColor}` : "none",
            }}
          >
            <span className="flex items-center overflow-hidden max-w-[200px]">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {player ? player.name : <span className="text-[var(--text-dim)] italic">-- TBD --</span>}
              </span>
              {player?.seed && <SeedBadge seed={player.seed} />}
            </span>
            {gameScore !== null
              ? <span className="text-sm shrink-0" style={{ color: isWinner ? winnerColor : "var(--text-dim)" }}>{gameScore}</span>
              : isWinner && <span className="text-sm shrink-0" style={{ color: winnerColor }}>WIN▶</span>
            }
          </div>
        );
      })}
    </div>
  );
}
