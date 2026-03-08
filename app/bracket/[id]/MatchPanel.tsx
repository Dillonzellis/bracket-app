"use client";

import { useState } from "react";
import { Match, BracketState, Game, resolvePlayer } from "@/lib/bracket";
import { cn } from "@/lib/cn";

type Props = {
  match: Match;
  state: BracketState;
  defaultFormat: 3 | 5;
  winnerColor: string;
  onConfirm: (matchId: string, winnerId: string, games: Game[], format: 3 | 5) => void;
  onUndo: (matchId: string) => void;
  onClose: () => void;
};

export default function MatchPanel({ match, state, defaultFormat, winnerColor, onConfirm, onUndo, onClose }: Props) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const format: 3 | 5 = match.format ?? defaultFormat;
  const winsNeeded = Math.ceil(format / 2);
  const existingGames = match.games ?? [];

  const [games, setGames] = useState<Game[]>(existingGames);
  const [localFormat, setLocalFormat] = useState<3 | 5>(format);

  const localWinsNeeded = Math.ceil(localFormat / 2);
  const p1Wins = games.filter(g => g.winner === "p1").length;
  const p2Wins = games.filter(g => g.winner === "p2").length;
  const matchWinner = p1Wins >= localWinsNeeded ? p1 : p2Wins >= localWinsNeeded ? p2 : null;
  const matchWinnerSlot = p1Wins >= localWinsNeeded ? "p1" : p2Wins >= localWinsNeeded ? "p2" : null;
  const canAddGame = !matchWinner && games.length < localFormat && !!p1 && !!p2;
  const isComplete = !!match.winner;

  const addGame = (winner: "p1" | "p2") => {
    if (!canAddGame) return;
    setGames(g => [...g, { winner }]);
  };

  const removeLastGame = () => setGames(g => g.slice(0, -1));

  const handleConfirm = () => {
    if (!matchWinner || !matchWinnerSlot) return;
    onConfirm(match.id, matchWinner.id, games, localFormat);
  };

  const players = [p1, p2] as const;
  const slots = ["p1", "p2"] as const;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-sm bg-[var(--bg-card)] border-l border-[var(--border)] flex flex-col font-mono overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="text-sm tracking-widest text-[var(--text-dim)]">
            {match.bracket.toUpperCase().replace("-", " ")}
          </span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">✕</button>
        </div>

        {/* Players */}
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-bold truncate" style={{ color: isComplete && match.winner?.id === p1?.id ? winnerColor : "var(--text)" }}>
              {p1?.name ?? "TBD"}
            </span>
            <span className="text-2xl font-bold text-[var(--text-dim)] shrink-0">
              {p1Wins} – {p2Wins}
            </span>
            <span className="text-lg font-bold truncate text-right" style={{ color: isComplete && match.winner?.id === p2?.id ? winnerColor : "var(--text)" }}>
              {p2?.name ?? "TBD"}
            </span>
          </div>
        </div>

        {/* Format toggle — only if match not yet complete */}
        {!isComplete && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
            <span className="text-sm text-[var(--text-dim)]">FORMAT:</span>
            {([3, 5] as const).map(f => (
              <button key={f} onClick={() => { setLocalFormat(f); setGames([]); }}
                className={cn(
                  "px-3 py-1 text-sm border transition-colors",
                  localFormat === f
                    ? "border-[var(--text)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)]"
                )}>
                Bo{f}
              </button>
            ))}
            <span className="text-xs text-[var(--text-dim)] ml-auto">first to {localWinsNeeded}</span>
          </div>
        )}

        {/* Games */}
        <div className="flex-1 px-4 py-4">
          <div className="text-xs text-[var(--text-dim)] mb-3 tracking-widest">GAMES</div>
          <div className="space-y-2">
            {Array.from({ length: isComplete ? (match.games?.length ?? games.length) : localFormat }).map((_, gi) => {
              const game = (isComplete ? match.games : games)?.[gi];
              const gameWinnerSlot = game?.winner;
              const gameWinner = gameWinnerSlot === "p1" ? p1 : gameWinnerSlot === "p2" ? p2 : null;
              const isLocked = isComplete || !!matchWinner;
              const isPlayable = !isLocked && gi === games.length;

              return (
                <div key={gi} className={cn(
                  "flex items-center gap-2 border px-3 py-2 transition-colors",
                  game ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-40"
                )}>
                  <span className="text-xs text-[var(--text-dim)] w-12 shrink-0">Game {gi + 1}</span>
                  {game ? (
                    <span className="flex-1 text-sm" style={{ color: winnerColor }}>{gameWinner?.name ?? "?"} wins</span>
                  ) : isPlayable ? (
                    <div className="flex gap-2 flex-1">
                      {slots.map((slot, si) => (
                        <button key={slot} onClick={() => addGame(slot)}
                          disabled={!players[si]}
                          className="flex-1 py-1 text-sm border border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] transition-colors disabled:opacity-30">
                          {players[si]?.name ?? "TBD"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="flex-1 text-sm text-[var(--text-dim)] italic">—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Undo last game */}
          {!isComplete && games.length > 0 && !matchWinner && (
            <button onClick={removeLastGame}
              className="mt-3 text-xs text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">
              ← undo last game
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-4 border-t border-[var(--border)] space-y-2">
          {isComplete ? (
            <>
              <div className="text-sm text-center mb-2" style={{ color: winnerColor }}>
                {match.winner?.name} wins {match.games ? `${Math.max(...[match.games.filter(g=>g.winner==="p1").length, match.games.filter(g=>g.winner==="p2").length])}–${Math.min(...[match.games.filter(g=>g.winner==="p1").length, match.games.filter(g=>g.winner==="p2").length])}` : ""}
              </div>
              <button onClick={() => onUndo(match.id)}
                className="w-full py-2 text-sm tracking-widest text-[#e8001c] border border-[#e8001c] hover:opacity-80 transition-opacity">
                RESET MATCH
              </button>
            </>
          ) : (
            <button onClick={handleConfirm}
              disabled={!matchWinner}
              className="w-full py-3 text-base tracking-widest font-bold text-black disabled:opacity-30 transition-opacity"
              style={{ background: matchWinner ? winnerColor : "var(--text-dim)", border: `1px solid ${winnerColor}` }}>
              {matchWinner ? `CONFIRM: ${matchWinner.name} WINS` : "SELECT GAME WINNERS"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
