"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BracketState, Match, generateBracket, reportResult, resolvePlayer } from "@/lib/bracket";

const MATCH_W = 210;
const MATCH_H = 68;
const COL_GAP = 68;
const SECTION_GAP = 60;

function colX(ri: number) { return ri * (MATCH_W + COL_GAP); }
function sectionH(n: number) { return Math.max(n, 1) * MATCH_H + Math.max(n - 1, 0) * 12; }
function cardY(totalH: number, count: number, mi: number) {
  const sh = totalH / count;
  return sh * mi + (sh - MATCH_H) / 2;
}
function midY(totalH: number, count: number, mi: number) {
  return cardY(totalH, count, mi) + MATCH_H / 2;
}

// GCN button for seed display
function SeedBadge({ seed }: { seed: number }) {
  const map: Record<number, { label: string; color: string }> = {
    1: { label: "A", color: "#00c846" },
    2: { label: "B", color: "#e8001c" },
    3: { label: "X", color: "#8888ff" },
  };
  const btn = map[seed];
  if (!btn) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 17, height: 17, borderRadius: "50%",
      background: btn.color, color: "#000",
      fontSize: 10, fontWeight: "bold", marginRight: 5, flexShrink: 0,
      boxShadow: `0 0 4px ${btn.color}`,
    }}>{btn.label}</span>
  );
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
  const addPath = (x1: number, y1: number, mx: number, y2: number, x2: number, color: string) =>
    paths.push({ d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, color });

  for (let ri = 0; ri < wRounds.length - 1; ri++) {
    const count = wRounds[ri].length;
    const nextCount = wRounds[ri + 1].length;
    const cx = colX(ri);
    for (let mi = 0; mi < count; mi++)
      addPath(cx + MATCH_W, wOffsetY + midY(wH, count, mi), cx + MATCH_W + COL_GAP / 2,
        wOffsetY + midY(wH, nextCount, Math.floor(mi / 2)), colX(ri + 1), "#2a1545");
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
    addPath(cx + MATCH_W, wOffsetY + midY(wH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + MATCH_H / 4, gfColX, "#2a1545");
  }
  if (lRounds.length > 0) {
    const cx = colX(lRounds.length - 1);
    addPath(cx + MATCH_W, lOffsetY + midY(lH, 1, 0), cx + MATCH_W + COL_GAP / 2, gfY + (MATCH_H * 3) / 4, gfColX, "#3d0820");
  }

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => router.push("/")}
          className="text-sm tracking-widest"
          style={{ color: "var(--text-dim)", fontFamily: "inherit" }}
          onMouseEnter={e => (e.target as HTMLElement).style.color = "var(--purple-light)"}
          onMouseLeave={e => (e.target as HTMLElement).style.color = "var(--text-dim)"}
        >◀ MENU</button>

        {/* Mini GCN controller icon */}
        <svg width="32" height="16" viewBox="0 0 120 60" style={{ opacity: 0.5 }}>
          <ellipse cx="60" cy="38" rx="55" ry="22" fill="#3b1a5a" stroke="#7b2fbe" strokeWidth="2"/>
          <ellipse cx="18" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
          <ellipse cx="102" cy="50" rx="14" ry="10" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
          <circle cx="82" cy="32" r="7" fill="#00c846"/>
          <circle cx="70" cy="40" r="5" fill="#e8001c"/>
          <circle cx="92" cy="40" r="5" fill="#8888ff"/>
          <circle cx="44" cy="24" r="8" fill="#2a1545" stroke="#7b2fbe" strokeWidth="1.5"/>
        </svg>

        <span className="text-base tracking-widest glow" style={{ color: "var(--purple-light)" }}>
          SSBM TOURNAMENT — DOUBLE ELIM
        </span>
      </div>

      {state.champion && (
        <div className="text-center py-2.5" style={{ borderBottom: "1px solid var(--border)", background: "#1a0a2e" }}>
          <span className="text-sm tracking-widest font-bold" style={{
            color: "#f0c000",
            textShadow: "0 0 10px #f0c000, 0 0 24px rgba(240,192,0,0.4)",
          }}>
            ★ GRAND CHAMPION: {state.champion.name} ★
          </span>
        </div>
      )}

      <div className="overflow-x-auto p-6 pt-5">
        <div className="relative" style={{ width: totalW, height: totalH + 36 }}>

          {/* Section labels */}
          <div className="absolute text-xs tracking-widest font-bold"
            style={{ color: "#a855f7", top: wOffsetY, left: 0, transform: "translateY(-20px)", textShadow: "0 0 8px #a855f7" }}>
            ▸ WINNERS BRACKET
          </div>
          <div className="absolute text-xs tracking-widest font-bold"
            style={{ color: "#e8001c", top: lOffsetY, left: 0, transform: "translateY(-20px)", textShadow: "0 0 8px #e8001c" }}>
            ▸ LOSERS BRACKET
          </div>
          <div className="absolute text-xs tracking-widest font-bold text-center"
            style={{ color: "#f0c000", left: gfColX, top: gfY - 20, width: MATCH_W, textShadow: "0 0 8px #f0c000" }}>
            ★ GRAND FINALS
          </div>

          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 36}>
            {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={1.5} />)}
          </svg>

          {wRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-xs text-center"
                  style={{ left: cx, top: wOffsetY - 18, width: MATCH_W, color: "var(--text-dim)", fontSize: 13 }}>
                  R{ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: wOffsetY + cardY(wH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin}
                      winnerColor="#a855f7" borderColor="#3b1a5a" />
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
                <div className="absolute text-xs text-center"
                  style={{ left: cx, top: lOffsetY - 18, width: MATCH_W, color: "var(--text-dim)", fontSize: 13 }}>
                  R{ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute" style={{ left: cx, top: lOffsetY + cardY(lH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin}
                      winnerColor="#e8001c" borderColor="#3d0820" />
                  </div>
                ))}
              </div>
            );
          })}

          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state} onWin={handleWin}
                winnerColor="#f0c000" borderColor="#3d3000" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MatchCard({ match, state, onWin, winnerColor, borderColor }: {
  match: Match; state: BracketState;
  onWin: (id: string, wid: string) => void;
  winnerColor: string; borderColor: string;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const canPlay = !match.winner && !!p1 && !!p2;

  return (
    <div style={{
      width: MATCH_W, height: MATCH_H,
      border: `1px solid ${match.winner ? winnerColor : borderColor}`,
      background: "var(--bg-card)",
      boxShadow: match.winner ? `0 0 10px ${winnerColor}33` : "none",
      overflow: "hidden",
    }}>
      {([p1, p2] as const).map((player, i) => {
        const isWinner = match.winner?.id === player?.id;
        const isLoser = match.loser?.id === player?.id;
        return (
          <button key={i}
            disabled={!canPlay || !player}
            onClick={() => player && canPlay && onWin(match.id, player.id)}
            style={{
              height: MATCH_H / 2, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 8px",
              fontFamily: "inherit", fontSize: "13px", letterSpacing: "0.04em",
              cursor: canPlay && player ? "pointer" : "default",
              borderBottom: i === 0 ? `1px solid ${borderColor}` : "none",
              background: isWinner ? `${winnerColor}20` : "transparent",
              color: isWinner ? winnerColor : isLoser ? "var(--text-dim)" : "var(--text)",
              textDecoration: isLoser ? "line-through" : "none",
              textShadow: isWinner ? `0 0 6px ${winnerColor}` : "none",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { if (canPlay && player) (e.currentTarget as HTMLElement).style.background = `${winnerColor}15`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isWinner ? `${winnerColor}20` : "transparent"; }}
          >
            <span style={{ display: "flex", alignItems: "center", overflow: "hidden", maxWidth: 170 }}>
              {player?.seed && <SeedBadge seed={player.seed} />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {player ? player.name : <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>-- TBD --</span>}
              </span>
            </span>
            {isWinner && <span style={{ color: winnerColor, fontSize: 11, flexShrink: 0 }}>WIN▶</span>}
          </button>
        );
      })}
    </div>
  );
}
