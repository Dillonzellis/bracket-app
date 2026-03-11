"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { isDebugMode } from "@/lib/db";
import { BracketState, Match, Game, reportResult, undoResult, countAffectedMatches, findByeSlots, addPlayerToSlot, addPlayerToLosers, resolvePlayer, disqualifyPlayer, getReadyMatches, getStandings, renamePlayerInMatch, movePlayer } from "@/lib/bracket";
import { getTournament, saveTournament, TournamentRecord } from "@/lib/db";
import { cn } from "@/lib/cn";
import { Suspense } from "react";
import MatchPanel from "./MatchPanel";

const MATCH_W = 150;
const MATCH_H = 44;
const COL_GAP = 56;
const SECTION_GAP = 72;
const L_SUB_GAP = 24; // gap between drop and consolidation sub-rounds within a losers column

const ROW_H = MATCH_H + 40; // vertical slot height for the densest round

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
  return <span className="text-xs text-(--text-dim) ml-1.5 shrink-0">[{seed}]</span>;
}

export default function BracketPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TournamentRecord | null>(null);

  useEffect(() => {
    getTournament(id).then(t => {
      if (!t) { router.push("/"); return; }
      setRecord(t);
    });
  }, [id, router]);

  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"queue" | "standings">("queue");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState<{ matchId: string; description: string } | null>(null);
  const searchParams = useSearchParams();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(searchParams.get("matchId"));

  useEffect(() => {
    if (searchParams.get("matchId")) {
      router.replace(window.location.pathname);
    }
  }, [router, searchParams]);
  const [editMode, setEditMode] = useState(false);
  const [editMatchId, setEditMatchId] = useState<string | null>(null);
  const [moveFrom, setMoveFrom] = useState<{ matchId: string; slot: "p1" | "p2" } | null>(null);
  const [lateEntry, setLateEntry] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateSlot, setLateSlot] = useState("");
  const [isAdmin, setIsAdmin] = useState(() => isDebugMode());

  useEffect(() => {
    if (isDebugMode()) return;
    createClient().auth.getUser().then(({ data }) => setIsAdmin(!!data.user));
  }, []);

  const update = (newState: BracketState) => {
    if (!record) return;
    const updated = { ...record, state: newState };
    setRecord(updated);
    saveTournament(updated); // fire-and-forget
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
        wOffsetY + wYTable[ri + 1][pmi] + MATCH_H / 2, colX(ri + 1), "#2d6b2d");
    }
  }
  for (let ri = 0; ri < lRounds.length - 1; ri++) {
    const cx = lRoundX[ri];
    const nx = lRoundX[ri + 1];
    for (let mi = 0; mi < lRounds[ri].length; mi++) {
      const pmi = lParent[ri][mi];
      if (pmi === null) continue;
      addPath(cx + MATCH_W, lOffsetY + lYTable[ri][mi] + MATCH_H / 2, cx + MATCH_W + (nx - cx - MATCH_W) / 2,
        lOffsetY + lYTable[ri + 1][pmi] + MATCH_H / 2, nx, "#7a1020");
    }
  }
  if (wRounds.length > 0) {
    const cx = colX(wRounds.length - 1);
    addPath(cx + MATCH_W, wOffsetY + wYTable[wRounds.length - 1][0] + MATCH_H / 2, cx + MATCH_W + COL_GAP / 2, gfY + MATCH_H / 4, gfColX, "#2d6b2d");
  }
  if (lRounds.length > 0) {
    const cx = lRoundX[lRounds.length - 1];
    addPath(cx + MATCH_W, lOffsetY + lYTable[lRounds.length - 1][0] + MATCH_H / 2, cx + MATCH_W + COL_GAP / 2, gfY + (MATCH_H * 3) / 4, gfColX, "#7a1020");
  }

  return (
    <main className="h-screen flex flex-col bg-[var(--bg)]">
      {/* Fixed header */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)]">
        {/* Top row: nav + title + actions */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={() => router.push("/")}
            className="text-sm tracking-widest font-mono text-[var(--text)] hover:text-[#39ff14] transition-colors shrink-0">
            ◀ MENU
          </button>
          <span className="hidden sm:block text-base tracking-widest glow text-[var(--text)] cursor-pointer hover:opacity-70 transition-opacity truncate flex-1 min-w-0"
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
              saveTournament(updated); // fire-and-forget
              setRenamingName(null);
            }} className="hidden sm:flex items-center gap-1 flex-1">
              <input autoFocus className="px-2 py-1 text-sm font-mono flex-1 min-w-0"
                value={renamingName} onChange={e => setRenamingName(e.target.value)}
                onKeyDown={e => e.key === "Escape" && setRenamingName(null)} />
              <button type="submit" className="text-xs px-2 py-1 border border-[var(--border)] text-[var(--text)] hover:border-[#39ff14] transition-colors shrink-0">OK</button>
              <button type="button" onClick={() => setRenamingName(null)} className="text-xs px-2 py-1 text-[var(--text)] hover:text-[#e8001c] transition-colors shrink-0">✕</button>
            </form>
          )}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}
              className="w-8 h-8 flex items-center justify-center font-mono text-base text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">−</button>
            <button onClick={() => setZoom(1)}
              className="px-2 h-8 font-mono text-xs text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}
              className="w-8 h-8 flex items-center justify-center font-mono text-base text-[var(--text)] border border-[var(--border)] hover:border-[var(--text)] transition-colors">+</button>
          </div>
          <button onClick={() => setDrawerOpen(o => !o)}
            className="text-xs tracking-widest font-mono text-[var(--text)] transition-colors border border-[var(--border)] px-2 h-8 hover:border-[#39ff14] hover:text-[#39ff14] shrink-0">
            ▲ INFO
          </button>
        </div>
        {/* Second row: search + late entry (collapses nicely on mobile) */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="SEARCH…"
            className="flex-1 min-w-0 px-2 py-1 text-sm font-mono"
          />
          {isAdmin && (
            <button onClick={() => setLateEntry(true)}
              className="text-xs tracking-widest font-mono text-[var(--text)] transition-colors border border-[var(--border)] px-2 h-8 hover:border-[#39ff14] hover:text-[#39ff14] shrink-0">
              + LATE ENTRY
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setEditMode(m => !m); setEditMatchId(null); setMoveFrom(null); }}
              className={cn(
                "text-xs tracking-widest font-mono transition-colors border px-2 h-8 shrink-0",
                editMode
                  ? "border-[#f0c000] text-[#f0c000]"
                  : "border-[var(--border)] text-[var(--text)] hover:border-[#f0c000] hover:text-[#f0c000]"
              )}>
              ✎ EDIT
            </button>
          )}
        </div>
      </div>

      {state.champion && (
        <div className="shrink-0 flex items-center justify-center gap-4 py-2 border-b border-[var(--border)] bg-[#1a1a0a]">
          <span className="text-sm tracking-widest font-bold text-[#f0c000]"
            style={{ textShadow: "0 0 10px #f0c000, 0 0 24px rgba(240,192,0,0.4)" }}>
            ★ CHAMPION: {state.champion.name} ★
          </span>
          <button onClick={() => router.push(`/bracket/${id}/results`)}
            className="text-xs tracking-widest font-mono px-3 py-1 border border-[#f0c000] text-[#f0c000] hover:bg-[#f0c00020] transition-colors">
            🏆 RESULTS
          </button>
        </div>
      )}

      {editMode && moveFrom && (
        <div className="shrink-0 text-center py-1.5 bg-[#f0c00015] border-b border-[#f0c00040] text-xs font-mono text-[#f0c000]">
          ✦ SELECT DESTINATION SLOT — <button className="underline" onClick={() => setMoveFrom(null)}>cancel</button>
        </div>
      )}

      {/* Scrollable bracket area */}
      <div className="flex-1 overflow-auto p-4 pt-20">
        <div style={{ width: totalW * zoom, height: (totalH + 36) * zoom }}>
        <div className="relative origin-top-left" style={{ width: totalW, height: totalH + 36, transform: `scale(${zoom})` }}>
          <div className="absolute text-sm tracking-widest font-bold text-(--text) glow"
            style={{ top: wOffsetY, left: 0, transform: "translateY(-44px)" }}>▸ WINNERS BRACKET</div>
          <div className="absolute text-sm tracking-widest font-bold text-[#e8001c]"
            style={{ top: lOffsetY, left: 0, transform: "translateY(-44px)", textShadow: "0 0 8px #e8001c" }}>▸ LOSERS BRACKET</div>
          <div className="absolute text-xs tracking-widest font-bold text-center text-[#f0c000]"
            style={{ left: gfColX, top: gfY - 18, width: MATCH_W, textShadow: "0 0 8px #f0c000" }}>★ GRAND FINALS</div>

          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 36}>
            {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />)}
          </svg>

          {wRounds.map((round, ri) => {
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-xs text-center text-(--text-dim)"
                  style={{ left: cx, top: wOffsetY - 16, width: MATCH_W }}>W-R{ri + 1}</div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: wOffsetY + wYTable[ri][mi] }}>
                    <MatchCard match={state.matches[id]} state={state}
                      onOpen={editMode ? setEditMatchId : setActiveMatchId}
                      editMode={editMode} moveFrom={moveFrom}
                      onSlotClick={(slot) => {
                        if (!editMode) return;
                        if (!moveFrom) { setMoveFrom({ matchId: id, slot }); }
                        else if (moveFrom.matchId === id && moveFrom.slot === slot) { setMoveFrom(null); }
                        else { update(movePlayer(state, moveFrom.matchId, moveFrom.slot, id, slot)); setMoveFrom(null); }
                      }}
                      winnerColor="#39ff14" borderColor="#2d6b2d" highlight={highlightedMatchIds.has(id)} ready={readyMatchIds.has(id)} />
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
                    <div className="absolute text-xs text-center text-(--text-dim)"
                      style={{ left: cx, top: lOffsetY - 16, width: MATCH_W }}>{label}</div>
                    {round.map((id, mi) => (
                      <div key={id} className="absolute" style={{ left: cx, top: lOffsetY + lYTable[roundIdx][mi] }}>
                        <MatchCard match={state.matches[id]} state={state}
                          onOpen={editMode ? setEditMatchId : setActiveMatchId}
                          editMode={editMode} moveFrom={moveFrom}
                          onSlotClick={(slot) => {
                            if (!editMode) return;
                            if (!moveFrom) { setMoveFrom({ matchId: id, slot }); }
                            else if (moveFrom.matchId === id && moveFrom.slot === slot) { setMoveFrom(null); }
                            else { update(movePlayer(state, moveFrom.matchId, moveFrom.slot, id, slot)); setMoveFrom(null); }
                          }}
                          winnerColor="#e8001c" borderColor="#7a1020" highlight={highlightedMatchIds.has(id)} ready={readyMatchIds.has(id)} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state}
                onOpen={editMode ? setEditMatchId : setActiveMatchId}
                editMode={editMode} moveFrom={moveFrom}
                onSlotClick={(slot) => {
                  if (!editMode) return;
                  if (!moveFrom) { setMoveFrom({ matchId: gf.id, slot }); }
                  else if (moveFrom.matchId === gf.id && moveFrom.slot === slot) { setMoveFrom(null); }
                  else { update(movePlayer(state, moveFrom.matchId, moveFrom.slot, gf.id, slot)); setMoveFrom(null); }
                }}
                winnerColor="#f0c000" borderColor="#6b5500" highlight={highlightedMatchIds.has(gf.id)} ready={readyMatchIds.has(gf.id)} />
            </div>
          )}
        </div>
        </div>
      </div>

      {activeMatchId && record && (() => {
        const match = state.matches[activeMatchId];
        const wc = match.bracket === "winners" ? "#39ff14" : match.bracket === "losers" ? "#e8001c" : "#f0c000";
        return (
          <Suspense>
          <MatchPanel
            match={match}
            state={state}
            defaultFormat={record.defaultFormat ?? 3}
            winnerColor={wc}
            onConfirm={handleWin}
            onUndo={isAdmin ? handleUndo : undefined}
            onDQ={handleDQ}
            onRename={(matchId, slot, name) => update(renamePlayerInMatch(state, matchId, slot, name))}
            onClose={() => setActiveMatchId(null)}
          />
          </Suspense>
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

      {editMatchId && record && (() => {
        const m = state.matches[editMatchId];
        const p1 = m.p1Source && typeof m.p1Source === "object" ? m.p1Source : null;
        const p2 = m.p2Source && typeof m.p2Source === "object" ? m.p2Source : null;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
            onClick={() => setEditMatchId(null)}>
            <div className="bg-[var(--bg-card)] border border-[#f0c000] p-5 w-full max-w-sm mx-4 mb-4 sm:mb-0 font-mono"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm tracking-widest text-[#f0c000]">✎ RENAME PLAYERS</span>
                <button onClick={() => setEditMatchId(null)} className="text-[var(--text-dim)] hover:text-[var(--text)]">✕</button>
              </div>
              <EditSlot label="P1" player={p1} onRename={name => {
                update(renamePlayerInMatch(state, editMatchId, "p1", name));
              }} />
              <EditSlot label="P2" player={p2} onRename={name => {
                update(renamePlayerInMatch(state, editMatchId, "p2", name));
              }} />
              <div className="mt-3 text-xs text-[var(--text-dim)] text-center">
                To move players between matches, click slots directly on the bracket.
              </div>
            </div>
          </div>
        );
      })()}

    </main>
  );
}

function EditSlot({ label, player, onRename }: {
  label: string;
  player: import("@/lib/bracket").Player | null;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(player?.name ?? "");
  if (!player) return (
    <div className="flex items-center gap-2 py-2 border-b border-[var(--border)] text-[var(--text-dim)] text-sm">
      <span className="w-6 text-xs">{label}</span>
      <span className="italic">TBD (from upstream match)</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 py-2 border-b border-[var(--border)]">
      <span className="w-6 text-xs text-[var(--text-dim)]">{label}</span>
      {editing ? (
        <form className="flex gap-1 flex-1" onSubmit={e => { e.preventDefault(); onRename(val.trim() || player.name); setEditing(false); }}>
          <input autoFocus className="flex-1 px-2 py-0.5 text-sm font-mono" value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Escape" && setEditing(false)} />
          <button type="submit" className="text-xs px-2 border border-[var(--border)] text-[var(--text)] hover:border-[#39ff14]">OK</button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm text-[var(--text)]">{player.name}</span>
          <button onClick={() => { setVal(player.name); setEditing(true); }}
            className="text-xs text-[var(--text-dim)] hover:text-[#f0c000] transition-colors">rename</button>
        </>
      )}
    </div>
  );
}

function MatchCard({ match, state, onOpen, winnerColor, borderColor, highlight, ready, editMode, moveFrom, onSlotClick }: {
  match: Match; state: BracketState;
  onOpen: (id: string) => void;
  winnerColor: string; borderColor: string;
  highlight?: boolean;
  ready?: boolean;
  editMode?: boolean;
  moveFrom?: { matchId: string; slot: "p1" | "p2" } | null;
  onSlotClick?: (slot: "p1" | "p2") => void;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const hasResult = !!match.winner;
  const p1Wins = match.games?.filter(g => g.winner === "p1").length ?? 0;
  const p2Wins = match.games?.filter(g => g.winner === "p2").length ?? 0;
  const isMovingFrom = editMode && moveFrom?.matchId === match.id;

  return (
    <div className={cn("relative overflow-hidden bg-(--bg-card) cursor-pointer", ready && !highlight && !editMode && "ready-pulse")}
      onClick={() => onOpen(match.id)}
      style={{
        width: MATCH_W, height: MATCH_H,
        border: `1px solid ${highlight ? "#fff" : editMode ? "#f0c000" : ready ? winnerColor : hasResult ? winnerColor : borderColor}`,
        boxShadow: highlight ? "0 0 12px #ffffff88" : editMode ? "0 0 8px #f0c00055" : ready ? `0 0 8px ${winnerColor}55` : hasResult ? `0 0 10px ${winnerColor}33` : "none",
      }}>
      {(["p1", "p2"] as const).map((slot, i) => {
        const player = slot === "p1" ? p1 : p2;
        const isWinner = match.winner?.id === player?.id;
        const isLoser = match.loser?.id === player?.id;
        const gameScore = match.games ? (slot === "p1" ? p1Wins : p2Wins) : null;
        const isSelected = isMovingFrom && moveFrom?.slot === slot;
        const isTarget = editMode && moveFrom && !(moveFrom.matchId === match.id && moveFrom.slot === slot);
        return (
          <div key={slot}
            className={cn(
              "w-full flex items-center justify-between px-1.5 font-mono text-xs tracking-wide",
              isLoser && !editMode && "line-through",
              editMode && "hover:bg-[#f0c00015]",
              isSelected && "bg-[#f0c00030]",
            )}
            onClick={editMode ? (e) => { e.stopPropagation(); onSlotClick?.(slot); } : undefined}
            style={{
              height: MATCH_H / 2,
              borderBottom: i === 0 ? `1px solid ${editMode ? "#f0c00040" : borderColor}` : "none",
              background: isSelected ? "#f0c00030" : isWinner && !editMode ? `${winnerColor}20` : undefined,
              color: isSelected ? "#f0c000" : isTarget ? "var(--text)" : isWinner && !editMode ? winnerColor : isLoser && !editMode ? "var(--text-dim)" : "var(--text)",
              textShadow: isSelected ? "0 0 6px #f0c000" : isWinner && !editMode ? `0 0 6px ${winnerColor}` : "none",
              cursor: editMode ? "pointer" : undefined,
            }}
          >
            <span className="flex items-center overflow-hidden min-w-0 flex-1">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs min-w-0">
                {player ? player.name : <span className="text-(--text-dim) italic">TBD</span>}
              </span>
              {player?.seed && <SeedBadge seed={player.seed} />}
            </span>
            {editMode
              ? <span className="text-xs shrink-0 text-[#f0c00080]">{isSelected ? "✦ MOVING" : "↕"}</span>
              : gameScore !== null
                ? <span className="text-xs shrink-0" style={{ color: isWinner ? winnerColor : "var(--text-dim)" }}>{gameScore}</span>
                : isWinner && <span className="text-xs shrink-0" style={{ color: winnerColor }}>WIN▶</span>
            }
          </div>
        );
      })}
    </div>
  );
}
