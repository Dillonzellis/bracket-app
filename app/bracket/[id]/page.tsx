"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { BracketState, Match, Game, reportResult, undoResult, countAffectedMatches, findByeSlots, addPlayerToSlot, addPlayerToLosers, resolvePlayer, disqualifyPlayer, getReadyMatches, getStandings } from "@/lib/bracket";
import { getTournament, saveTournament, TournamentRecord } from "@/lib/db";
import { cn } from "@/lib/cn";
import MatchPanel from "./MatchPanel";

const MATCH_W = 280;
const MATCH_H = 120;
const COL_GAP = 72;
const SECTION_GAP = 96;
const L_SUB_GAP = 32; // gap between drop and consolidation sub-rounds within a losers column

const ROW_H = MATCH_H + 56; // vertical slot height for the densest round

function colX(ri: number) { return ri * (MATCH_W + COL_GAP); }

// Group losers rounds into visual columns: each column holds a [drop, consolidate] pair.
// Returns an array of column groups, each with round indices and their X offsets within the column.
function buildLosersColumns(lRounds: string[][]): { roundIdx: number; subX: number }[][] {
  const cols: { roundIdx: number; subX: number }[][] = [];
  let ri = 0;
  while (ri < lRounds.length) {
    const drop = ri;
    const con = ri + 1 < lRounds.length && lRounds[ri + 1].length < lRounds[ri].length ? ri + 1 : null;
    if (con !== null) {
      cols.push([
        { roundIdx: drop, subX: 0 },
        { roundIdx: con, subX: MATCH_W + L_SUB_GAP },
      ]);
      ri += 2;
    } else {
      cols.push([{ roundIdx: drop, subX: 0 }]);
      ri += 1;
    }
  }
  return cols;
}

// Build a per-round, per-match Y position table.
// The densest round defines the base grid; all other rounds are positioned
// by following actual match wiring (parent = match whose p1Source/p2Source is this id).
function buildYTable(rounds: string[][], matches: Record<string, import("@/lib/bracket").Match>): number[][] {
  if (rounds.length === 0) return [];
  const maxCount = Math.max(...rounds.map(r => r.length));
  const totalH = maxCount * ROW_H;

  // Assign every round's cards using the base grid: evenly space by match index
  // within the section height. This guarantees no two cards in the same round overlap.
  const table: number[][] = rounds.map((round) =>
    round.map((_, mi) => {
      const slot = totalH / round.length;
      return slot * mi + (slot - MATCH_H) / 2;
    })
  );

  // For consolidation rounds (fewer matches than previous), re-center each card
  // at the midpoint of its feeders so lines connect correctly.
  for (let ri = 1; ri < rounds.length; ri++) {
    if (rounds[ri].length >= rounds[ri - 1].length) continue; // not a consolidation round
    for (let mi = 0; mi < rounds[ri].length; mi++) {
      const feeders = rounds[ri - 1]
        .map((id, fmi) => {
          const m = matches[rounds[ri][mi]];
          const feeds = m.p1Source === id || m.p2Source === id ||
                        m.p1SourceLoser === id || m.p2SourceLoser === id;
          return feeds ? table[ri - 1][fmi] : null;
        })
        .filter((y): y is number => y !== null);
      if (feeders.length > 0)
        table[ri][mi] = (Math.min(...feeders) + Math.max(...feeders)) / 2;
    }
  }

  return table;
}

function sectionH(rounds: string[][]): number {
  if (rounds.length === 0) return ROW_H;
  return Math.max(...rounds.map(r => r.length)) * ROW_H;
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
  const [search, setSearch] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"queue" | "standings">("queue");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const handleDQ = (matchId: string, playerId: string) => {
    if (!record) return;
    update(disqualifyPlayer(record.state, playerId));
    setActiveMatchId(null);
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

  const readyMatches = getReadyMatches(state);
  const standings = getStandings(state);

  const searchLower = search.trim().toLowerCase();
  const highlightedMatchIds = searchLower
    ? new Set(Object.values(state.matches).filter(m => {
        const p1 = resolvePlayer(state, m, "p1");
        const p2 = resolvePlayer(state, m, "p2");
        return p1?.name.toLowerCase().includes(searchLower) || p2?.name.toLowerCase().includes(searchLower);
      }).map(m => m.id))
    : new Set<string>();

  const readyMatchIds = new Set(readyMatches.map(m => m.id));

  const wYTable = buildYTable(wRounds, state.matches);
  const lYTable = buildYTable(lRounds, state.matches);
  const wH = sectionH(wRounds);
  const lH = sectionH(lRounds);
  const lCols = buildLosersColumns(lRounds);
  // Each losers column occupies MATCH_W + L_SUB_GAP + MATCH_W wide, then COL_GAP to next column
  const lColW = MATCH_W * 2 + L_SUB_GAP;
  function lColX(ci: number) { return ci * (lColW + COL_GAP); }
  const numCols = Math.max(wRounds.length, lCols.length);
  // Winners uses colX (MATCH_W + COL_GAP steps), losers uses lColX (lColW + COL_GAP steps)
  // GF goes after the wider of the two
  const wTotalW = wRounds.length > 0 ? colX(wRounds.length - 1) + MATCH_W : 0;
  const lTotalW = lCols.length > 0 ? lColX(lCols.length - 1) + lColW : 0;
  const gfColX = Math.max(wTotalW, lTotalW) + COL_GAP;
  const totalW = gfColX + MATCH_W + 24;
  const totalH = wH + SECTION_GAP + lH;
  const wOffsetY = 0;
  const lOffsetY = wH + SECTION_GAP;
  const gfY = totalH / 2 - MATCH_H / 2;

  const paths: { d: string; color: string }[] = [];
  const addPath = (x1: number, y1: number, mx: number, y2: number, x2: number, color: string) =>
    paths.push({ d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, color });

  // Build parent index maps for connector paths
  function buildParentMap(rounds: string[][]): (number | null)[][] {
    const parentIdx: (number | null)[][] = rounds.map(() => []);
    for (let ri = 0; ri < rounds.length - 1; ri++) {
      for (let mi = 0; mi < rounds[ri].length; mi++) {
        const id = rounds[ri][mi];
        const nextRound = rounds[ri + 1];
        const pmi = nextRound.findIndex(pid => {
          const m = state.matches[pid];
          return m.p1Source === id || m.p2Source === id ||
                 m.p1SourceLoser === id || m.p2SourceLoser === id;
        });
        parentIdx[ri][mi] = pmi >= 0 ? pmi : null;
      }
    }
    return parentIdx;
  }
  const wParent = buildParentMap(wRounds);
  const lParent = buildParentMap(lRounds);

  // Build X position lookup for each losers round index
  const lRoundX: number[] = new Array(lRounds.length).fill(0);
  for (const col of lCols) {
    for (const { roundIdx, subX } of col) {
      const ci = lCols.indexOf(col);
      lRoundX[roundIdx] = lColX(ci) + subX;
    }
  }

  for (let ri = 0; ri < wRounds.length - 1; ri++) {
    const cx = colX(ri);
    for (let mi = 0; mi < wRounds[ri].length; mi++) {
      const pmi = wParent[ri][mi];
      if (pmi === null) continue;
      addPath(cx + MATCH_W, wOffsetY + wYTable[ri][mi] + MATCH_H / 2, cx + MATCH_W + COL_GAP / 2,
        wOffsetY + wYTable[ri + 1][pmi] + MATCH_H / 2, colX(ri + 1), "#1a3a1a");
    }
  }
  for (let ri = 0; ri < lRounds.length - 1; ri++) {
    const cx = lRoundX[ri];
    const nx = lRoundX[ri + 1];
    for (let mi = 0; mi < lRounds[ri].length; mi++) {
      const pmi = lParent[ri][mi];
      if (pmi === null) continue;
      addPath(cx + MATCH_W, lOffsetY + lYTable[ri][mi] + MATCH_H / 2, cx + MATCH_W + (nx - cx - MATCH_W) / 2,
        lOffsetY + lYTable[ri + 1][pmi] + MATCH_H / 2, nx, "#3d0820");
    }
  }
  if (wRounds.length > 0) {
    const cx = colX(wRounds.length - 1);
    addPath(cx + MATCH_W, wOffsetY + wYTable[wRounds.length - 1][0] + MATCH_H / 2, cx + MATCH_W + COL_GAP / 2, gfY + MATCH_H / 4, gfColX, "#1a3a1a");
  }
  if (lRounds.length > 0) {
    const cx = lRoundX[lRounds.length - 1];
    addPath(cx + MATCH_W, lOffsetY + lYTable[lRounds.length - 1][0] + MATCH_H / 2, cx + MATCH_W + COL_GAP / 2, gfY + (MATCH_H * 3) / 4, gfColX, "#3d0820");
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
        <span className="text-xl tracking-widest glow text-[var(--text)] cursor-pointer hover:opacity-70 transition-opacity"
          title="Click to rename"
          onClick={() => setRenamingName(record.name)}>
          {record.name}
        </span>
        {renamingName !== null && (
          <form onSubmit={e => {
            e.preventDefault();
            if (!renamingName.trim()) return;
            const updated = { ...record, name: renamingName.trim() };
            setRecord(updated);
            saveTournament(updated);
            setRenamingName(null);
          }} className="flex items-center gap-1">
            <input autoFocus className="px-2 py-1 text-base font-mono w-48"
              value={renamingName} onChange={e => setRenamingName(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setRenamingName(null)} />
            <button type="submit" className="text-xs px-2 py-1 border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">OK</button>
            <button type="button" onClick={() => setRenamingName(null)} className="text-xs px-2 py-1 text-[var(--text-dim)] hover:text-[var(--text)] transition-colors">✕</button>
          </form>
        )}
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
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH…"
          className="w-36 px-2 py-1 text-sm font-mono"
        />
        <button onClick={() => setDrawerOpen(o => !o)}
          className="text-sm tracking-widest font-mono text-(--text-dim) hover:text-(--text) transition-colors border border-(--border) px-3 py-1 hover:border-(--text)">
          ▲ INFO
        </button>
      </div>

      {state.champion && (
        <div className="text-center py-3 border-b border-(--border) bg-[#1a0a2e]">
          <span className="text-lg tracking-widest font-bold text-[#f0c000]"
            style={{ textShadow: "0 0 10px #f0c000, 0 0 24px rgba(240,192,0,0.4)" }}>
            ★ GRAND CHAMPION: {state.champion.name} ★
          </span>
        </div>
      )}

      <div className="overflow-x-auto p-6 pt-16">
        <div style={{ width: totalW * zoom, height: (totalH + 36) * zoom }}>
        <div className="relative origin-top-left" style={{ width: totalW, height: totalH + 36, transform: `scale(${zoom})` }}>
          <div className="absolute text-lg tracking-widest font-bold text-(--text) glow"
            style={{ top: wOffsetY, left: 0, transform: "translateY(-22px)" }}>▸ WINNERS BRACKET</div>
          <div className="absolute text-base tracking-widest font-bold text-[#e8001c]"
            style={{ top: lOffsetY, left: 0, transform: "translateY(-22px)", textShadow: "0 0 8px #e8001c" }}>▸ LOSERS BRACKET</div>
          <div className="absolute text-base tracking-widest font-bold text-center text-[#f0c000]"
            style={{ left: gfColX, top: gfY - 24, width: MATCH_W, textShadow: "0 0 8px #f0c000" }}>★ GRAND FINALS</div>

          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 36}>
            {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />)}
          </svg>

          {wRounds.map((round, ri) => {
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-base text-center text-(--text-dim)"
                  style={{ left: cx, top: wOffsetY - 20, width: MATCH_W }}>R{ri + 1}</div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: wOffsetY + wYTable[ri][mi] }}>
                    <MatchCard match={state.matches[id]} state={state} onOpen={setActiveMatchId}
                      winnerColor="#39ff14" borderColor="#1a3a1a" highlight={highlightedMatchIds.has(id)} ready={readyMatchIds.has(id)} />
                  </div>
                ))}
              </div>
            );
          })}

          {lCols.map((col, ci) => (
            <div key={`lc${ci}`}>
              {col.map(({ roundIdx, subX }) => {
                const round = lRounds[roundIdx];
                const cx = lColX(ci) + subX;
                const label = col.length === 2
                  ? (subX === 0 ? `L-R${roundIdx + 1}` : `L-R${roundIdx + 1}`)
                  : `L-R${roundIdx + 1}`;
                return (
                  <div key={`l${roundIdx}`}>
                    <div className="absolute text-base text-center text-(--text-dim)"
                      style={{ left: cx, top: lOffsetY - 20, width: MATCH_W }}>{label}</div>
                    {round.map((id, mi) => (
                      <div key={id} className="absolute" style={{ left: cx, top: lOffsetY + lYTable[roundIdx][mi] }}>
                        <MatchCard match={state.matches[id]} state={state} onOpen={setActiveMatchId}
                          winnerColor="#e8001c" borderColor="#3d0820" highlight={highlightedMatchIds.has(id)} ready={readyMatchIds.has(id)} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state} onOpen={setActiveMatchId}
                winnerColor="#f0c000" borderColor="#3d3000" highlight={highlightedMatchIds.has(gf.id)} ready={readyMatchIds.has(gf.id)} />
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
            onDQ={handleDQ}
            onClose={() => setActiveMatchId(null)}
          />
        );
      })()}

      {drawerOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-card)] border-t border-[var(--border)] font-mono">
          <div className="flex items-center gap-0 border-b border-[var(--border)]">
            {(["queue", "standings"] as const).map(tab => (
              <button key={tab} onClick={() => setDrawerTab(tab)}
                className={cn("px-4 py-2 text-xs tracking-widest transition-colors",
                  drawerTab === tab ? "text-[var(--text)] border-b-2 border-[var(--text)]" : "text-(--text-dim) hover:text-[var(--text)]"
                )}>
                {tab === "queue" ? `▶ ON DECK (${readyMatches.length})` : `★ STANDINGS`}
              </button>
            ))}
            <button onClick={() => setDrawerOpen(false)} className="ml-auto px-3 py-2 text-xs text-[var(--text-dim)] hover:text-[var(--text)]">✕</button>
          </div>
          <div className="overflow-x-auto">
            {drawerTab === "queue" ? (
              <div className="flex gap-3 px-4 py-3">
                {readyMatches.length === 0
                  ? <span className="text-sm text-(--text-dim) italic">No matches ready</span>
                  : readyMatches.map(m => {
                      const p1 = resolvePlayer(state, m, "p1");
                      const p2 = resolvePlayer(state, m, "p2");
                      const color = m.bracket === "winners" ? "#39ff14" : m.bracket === "losers" ? "#e8001c" : "#f0c000";
                      return (
                        <button key={m.id} onClick={() => { setActiveMatchId(m.id); setDrawerOpen(false); }}
                          className="shrink-0 border px-3 py-2 text-sm text-left hover:opacity-80 transition-opacity"
                          style={{ borderColor: color, minWidth: 180 }}>
                          <div className="text-xs mb-1" style={{ color }}>{m.bracket.toUpperCase().replace("-", " ")} · {m.id}</div>
                          <div className="text-(--text)">{p1?.name ?? "TBD"}</div>
                          <div className="text-(--text-dim) text-xs">vs</div>
                          <div className="text-(--text)">{p2?.name ?? "TBD"}</div>
                        </button>
                      );
                    })
                }
              </div>
            ) : (
              <div className="flex flex-col gap-1 px-4 py-3 min-w-50">
                {standings.length === 0
                  ? <span className="text-sm text-(--text-dim) italic">No results yet</span>
                  : standings.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-0.5">
                        <span className="text-(--text-dim) w-12 shrink-0">{s.place}</span>
                        <span className="text-(--text)">{s.player.name}</span>
                      </div>
                    ))
                }
              </div>
            )}
          </div>
        </div>
      )}

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
                  className="flex-1 py-2 text-sm tracking-widest text-(--text-dim) border border-(--border) hover:text-(--text) transition-colors">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmUndo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-(--bg-card) border border-(--border) p-6 max-w-sm w-full mx-4 font-mono">
            <div className="text-base tracking-widest font-bold text-(--text) mb-3">⚠ UNDO RESULT?</div>
            <div className="text-sm text-(--text-dim) mb-6">{confirmUndo.description}</div>
            <div className="flex gap-3">
              <button onClick={confirmAndUndo}
                className="flex-1 py-2 text-sm tracking-widest font-bold text-black bg-[#e8001c] border border-[#e8001c] hover:opacity-80 transition-opacity">
                UNDO
              </button>
              <button onClick={() => setConfirmUndo(null)}
                className="flex-1 py-2 text-sm tracking-widest text-(--text-dim) border border-(--border) hover:text-(--text) transition-colors">
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MatchCard({ match, state, onOpen, winnerColor, borderColor, highlight, ready }: {
  match: Match; state: BracketState;
  onOpen: (id: string) => void;
  winnerColor: string; borderColor: string;
  highlight?: boolean;
  ready?: boolean;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const hasResult = !!match.winner;
  const p1Wins = match.games?.filter(g => g.winner === "p1").length ?? 0;
  const p2Wins = match.games?.filter(g => g.winner === "p2").length ?? 0;

  return (
    <div className={cn("relative overflow-hidden bg-(--bg-card) cursor-pointer", ready && !highlight && "ready-pulse")}
      onClick={() => onOpen(match.id)}
      style={{
        width: MATCH_W, height: MATCH_H,
        border: `1px solid ${highlight ? "#fff" : ready ? winnerColor : hasResult ? winnerColor : borderColor}`,
        boxShadow: highlight ? "0 0 12px #ffffff88" : ready ? `0 0 8px ${winnerColor}55` : hasResult ? `0 0 10px ${winnerColor}33` : "none",
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
            <span className="flex items-center overflow-hidden max-w-50">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {player ? player.name : <span className="text-(--text-dim) italic">-- TBD --</span>}
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
