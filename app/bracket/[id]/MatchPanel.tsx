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
  onDQ: (matchId: string, playerId: string) => void;
  onRename: (matchId: string, slot: "p1" | "p2", name: string) => void;
  onClose: () => void;
};

export default function MatchPanel({ match, state, defaultFormat, winnerColor, onConfirm, onUndo, onDQ, onRename, onClose }: Props) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const format: 3 | 5 = match.format ?? defaultFormat;
  const existingGames = match.games ?? [];

  const [games, setGames] = useState<Game[]>(existingGames);
  const [localFormat, setLocalFormat] = useState<3 | 5>(format);
  const [editingSlot, setEditingSlot] = useState<"p1" | "p2" | null>(null);
  const [editingName, setEditingName] = useState("");

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
    <div className="fixed inset-0 z-40 flex flex-col justify-end sm:flex-row sm:justify-end" onClick={onClose}>
      <div
        className="relative w-full max-h-[85vh] sm:h-full sm:max-h-full sm:max-w-sm bg-[var(--bg-card)] border-t sm:border-t-0 sm:border-l border-[var(--border)] flex flex-col font-mono overflow-y-auto"
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
            <PlayerName player={p1} slot="p1" isWinner={isComplete && match.winner?.id === p1?.id} winnerColor={winnerColor}
              canEdit={!isComplete && typeof match.p1Source === "object" && match.p1Source !== null}
              editingSlot={editingSlot} editingName={editingName}
              onStartEdit={(slot, name) => { setEditingSlot(slot); setEditingName(name); }}
              onCommit={(name) => { onRename(match.id, "p1", name); setEditingSlot(null); }}
              onCancel={() => setEditingSlot(null)}
              onChange={setEditingName} />
            <span className="text-2xl font-bold text-[var(--text-dim)] shrink-0">
              {p1Wins} – {p2Wins}
            </span>
            <PlayerName player={p2} slot="p2" isWinner={isComplete && match.winner?.id === p2?.id} winnerColor={winnerColor}
              canEdit={!isComplete && typeof match.p2Source === "object" && match.p2Source !== null}
              editingSlot={editingSlot} editingName={editingName}
              onStartEdit={(slot, name) => { setEditingSlot(slot); setEditingName(name); }}
              onCommit={(name) => { onRename(match.id, "p2", name); setEditingSlot(null); }}
              onCancel={() => setEditingSlot(null)}
              onChange={setEditingName} />
          </div>
        </div>

          {!isComplete && p1 && p2 && (
            <div className="flex gap-2 mt-3">
              {([p1, p2] as const).map(p => (
                <button key={p.id} onClick={() => onDQ(match.id, p.id)}
                  className="flex-1 py-1 text-xs tracking-widest text-[#e8001c] border border-[#e8001c]/40 hover:border-[#e8001c] hover:opacity-80 transition-colors">
                  DQ {p.name}
                </button>
              ))}
            </div>
          )}
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

function PlayerName({ player, slot, isWinner, winnerColor, canEdit, editingSlot, editingName, onStartEdit, onCommit, onCancel, onChange }: {
  player: import("@/lib/bracket").Player | null;
  slot: "p1" | "p2";
  isWinner: boolean;
  winnerColor: string;
  canEdit: boolean;
  editingSlot: "p1" | "p2" | null;
  editingName: string;
  onStartEdit: (slot: "p1" | "p2", name: string) => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  onChange: (name: string) => void;
}) {
  const isEditing = editingSlot === slot;
  const isRight = slot === "p2";

  if (isEditing) {
    return (
      <form className={cn("flex flex-col gap-1 flex-1", isRight && "items-end")}
        onSubmit={e => { e.preventDefault(); onCommit(editingName.trim() || player!.name); }}>
        <input autoFocus className="px-2 py-0.5 text-sm font-mono w-full"
          value={editingName} onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Escape" && onCancel()} />
        <div className={cn("flex gap-1", isRight && "justify-end")}>
          <button type="submit" className="text-xs px-2 py-0.5 border border-[var(--border)] text-[var(--text)] hover:border-[#39ff14]">OK</button>
          <button type="button" onClick={onCancel} className="text-xs px-2 py-0.5 text-[var(--text-dim)] hover:text-[var(--text)]">✕</button>
        </div>
      </form>
    );
  }

  return (
    <div className={cn("flex flex-col flex-1 overflow-hidden", isRight && "items-end")}>
      <span className={cn("text-lg font-bold truncate", isRight && "text-right")}
        style={{ color: isWinner ? winnerColor : "var(--text)" }}>
        {player?.name ?? "TBD"}
      </span>
      {canEdit && player && (
        <button onClick={() => onStartEdit(slot, player.name)}
          className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] transition-colors mt-0.5">
          rename
        </button>
      )}
    </div>
  );
}
