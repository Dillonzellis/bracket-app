"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BracketState, Match, generateBracket, reportResult, resolvePlayer,
} from "@/lib/bracket";

const MATCH_W = 180;
const MATCH_H = 56;
const COL_GAP = 60;
const SECTION_GAP = 48;

function colX(ri: number) { return ri * (MATCH_W + COL_GAP); }
function sectionH(n: number) { return Math.max(n, 1) * MATCH_H + Math.max(n - 1, 0) * 12; }
function cardY(totalH: number, count: number, mi: number) {
  const sh = totalH / count;
  return sh * mi + (sh - MATCH_H) / 2;
}
function midY(totalH: number, count: number, mi: number) {
  return cardY(totalH, count, mi) + MATCH_H / 2;
}

export default function BracketPage() {
  const router = useRouter();
  const [state, setState] = useState<BracketState | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("bracket-players");
    if (!raw) return router.push("/");
    setState(generateBracket(JSON.parse(raw)));
  }, [router]);

  const handleWin = (matchId: string, winnerId: string) =>
    setState((s) => (s ? reportResult(s, matchId, winnerId) : s));

  if (!state) return null;

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

  const addPath = (x1: number, y1: number, mx: number, y2: number, x2: number, color: string) => {
    paths.push({ d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, color });
  };

  for (let ri = 0; ri < wRounds.length - 1; ri++) {
    const count = wRounds[ri].length;
    const nextCount = wRounds[ri + 1].length;
    const cx = colX(ri);
    for (let mi = 0; mi < count; mi++) {
      addPath(
        cx + MATCH_W, wOffsetY + midY(wH, count, mi),
        cx + MATCH_W + COL_GAP / 2,
        wOffsetY + midY(wH, nextCount, Math.floor(mi / 2)),
        colX(ri + 1), "#1a4a1a"
      );
    }
  }

  for (let ri = 0; ri < lRounds.length - 1; ri++) {
    const count = lRounds[ri].length;
    const nextCount = lRounds[ri + 1].length;
    const cx = colX(ri);
    for (let mi = 0; mi < count; mi++) {
      addPath(
        cx + MATCH_W, lOffsetY + midY(lH, count, mi),
        cx + MATCH_W + COL_GAP / 2,
        lOffsetY + midY(lH, nextCount, Math.floor(mi / 2)),
        colX(ri + 1), "#4a1a1a"
      );
    }
  }

  // Winners finalist → GF top slot
  if (wRounds.length > 0) {
    const cx = colX(wRounds.length - 1);
    addPath(cx + MATCH_W, wOffsetY + midY(wH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + MATCH_H / 4, gfColX, "#1a4a1a");
  }
  // Losers finalist → GF bottom slot
  if (lRounds.length > 0) {
    const cx = colX(lRounds.length - 1);
    addPath(cx + MATCH_W, lOffsetY + midY(lH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + (MATCH_H * 3) / 4, gfColX, "#4a1a1a");
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header bar */}
      <div className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => router.push("/")}
          className="text-xs tracking-widest transition"
          style={{ color: "var(--green-dim)", fontFamily: "inherit" }}
          onMouseEnter={e => (e.target as HTMLElement).style.color = "var(--green)"}
          onMouseLeave={e => (e.target as HTMLElement).style.color = "var(--green-dim)"}
        >
          ◀ BACK
        </button>
        <span className="text-sm tracking-widest glow">BRACKET SYS — DOUBLE ELIMINATION</span>
      </div>

      {state.champion && (
        <div className="text-center py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <span
            className="text-sm tracking-widest font-bold"
            style={{
              color: "var(--amber)",
              textShadow: "0 0 10px var(--amber), 0 0 20px rgba(255,176,0,0.4)",
            }}
          >
            ★ CHAMPION: {state.champion.name} ★
          </span>
        </div>
      )}

      <div className="overflow-x-auto p-6 pt-5">
        <div className="relative" style={{ width: totalW, height: totalH + 36 }}>

          {/* Section labels */}
          <div className="absolute text-xs tracking-widest"
            style={{ color: "#22c55e", top: wOffsetY, left: 0, transform: "translateY(-20px)", textShadow: "0 0 6px #22c55e" }}>
            ▸ WINNERS
          </div>
          <div className="absolute text-xs tracking-widest"
            style={{ color: "#ef4444", top: lOffsetY, left: 0, transform: "translateY(-20px)", textShadow: "0 0 6px #ef4444" }}>
            ▸ LOSERS
          </div>
          <div className="absolute text-xs tracking-widest"
            style={{ color: "var(--amber)", left: gfColX, top: gfY - 20, width: MATCH_W, textAlign: "center", textShadow: "0 0 6px var(--amber)" }}>
            ★ GRAND FINALS
          </div>

          {/* SVG lines */}
          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 36}>
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />
            ))}
          </svg>

          {/* Winners rounds */}
          {wRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-xs text-center"
                  style={{ left: cx, top: wOffsetY - 16, width: MATCH_W, color: "var(--green-dim)" }}>
                  R{ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute"
                    style={{ left: cx, top: wOffsetY + cardY(wH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin} accent="#22c55e" />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Losers rounds */}
          {lRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`l${ri}`}>
                <div className="absolute text-xs text-center"
                  style={{ left: cx, top: lOffsetY - 16, width: MATCH_W, color: "var(--green-dim)" }}>
                  R{ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute"
                    style={{ left: cx, top: lOffsetY + cardY(lH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin} accent="#ef4444" />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Grand Finals */}
          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state} onWin={handleWin} accent="var(--amber)" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MatchCard({ match, state, onWin, accent }: {
  match: Match; state: BracketState;
  onWin: (id: string, wid: string) => void;
  accent: string;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const canPlay = !match.winner && !!p1 && !!p2;

  return (
    <div style={{
      width: MATCH_W, height: MATCH_H,
      border: `1px solid ${match.winner ? accent : "var(--border)"}`,
      background: "var(--bg-card)",
      boxShadow: match.winner ? `0 0 8px ${accent}40` : "none",
      overflow: "hidden",
    }}>
      {([p1, p2] as const).map((player, i) => {
        const isWinner = match.winner?.id === player?.id;
        const isLoser = match.loser?.id === player?.id;
        return (
          <button
            key={i}
            disabled={!canPlay || !player}
            onClick={() => player && canPlay && onWin(match.id, player.id)}
            style={{
              height: MATCH_H / 2,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 8px",
              fontFamily: "inherit",
              fontSize: "11px",
              letterSpacing: "0.05em",
              cursor: canPlay && player ? "pointer" : "default",
              borderBottom: i === 0 ? "1px solid var(--border)" : "none",
              background: isWinner ? `${accent}22` : "transparent",
              color: isWinner ? accent : isLoser ? "var(--green-dim)" : "var(--green)",
              textDecoration: isLoser ? "line-through" : "none",
              textShadow: isWinner ? `0 0 8px ${accent}` : "none",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (canPlay && player) (e.currentTarget as HTMLElement).style.background = `${accent}18`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isWinner ? `${accent}22` : "transparent"; }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
              {player
                ? <>{player.seed && <span style={{ color: "var(--amber)", marginRight: 4 }}>[S{player.seed}]</span>}{player.name}</>
                : <span style={{ color: "var(--green-dim)", fontStyle: "italic" }}>-- TBD --</span>}
            </span>
            {isWinner && <span style={{ color: accent, fontSize: 10 }}>◀WIN</span>}
          </button>
        );
      })}
    </div>
  );
}
