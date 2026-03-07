"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BracketState, Match, generateBracket, reportResult, resolvePlayer,
} from "@/lib/bracket";

const MATCH_W = 176;
const MATCH_H = 56;
const COL_GAP = 60;
const SECTION_GAP = 48; // vertical gap between winners and losers

function colX(ri: number) {
  return ri * (MATCH_W + COL_GAP);
}

function sliceH(totalH: number, count: number) {
  return totalH / count;
}

function cardY(totalH: number, count: number, mi: number) {
  const sh = sliceH(totalH, count);
  return sh * mi + (sh - MATCH_H) / 2;
}

function midY(totalH: number, count: number, mi: number) {
  return cardY(totalH, count, mi) + MATCH_H / 2;
}

function sectionH(firstCount: number) {
  return Math.max(firstCount, 1) * MATCH_H + Math.max(firstCount - 1, 0) * 12;
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

  const wFirstCount = wRounds[0]?.length ?? 1;
  const lFirstCount = lRounds[0]?.length ?? 1;
  const wH = sectionH(wFirstCount);
  const lH = sectionH(lFirstCount);

  // Both brackets share the same number of columns (use the max)
  const numCols = Math.max(wRounds.length, lRounds.length);
  const gfColX = colX(numCols); // grand finals sits one column past the last round
  const totalW = gfColX + MATCH_W + COL_GAP;
  const totalH = wH + SECTION_GAP + lH;

  const wOffsetY = 0;
  const lOffsetY = wH + SECTION_GAP;

  // Grand finals is vertically centered in the full canvas
  const gfY = totalH / 2 - MATCH_H / 2;

  // Build SVG lines
  const paths: string[] = [];
  const stroke = "#374151";

  // Winners bracket internal connectors
  for (let ri = 0; ri < wRounds.length - 1; ri++) {
    const count = wRounds[ri].length;
    const nextCount = wRounds[ri + 1].length;
    const cx = colX(ri);
    const ncx = colX(ri + 1);
    const mx = cx + MATCH_W + COL_GAP / 2;
    for (let mi = 0; mi < count; mi++) {
      const y1 = wOffsetY + midY(wH, count, mi);
      const y2 = wOffsetY + midY(wH, nextCount, Math.floor(mi / 2));
      paths.push(`M ${cx + MATCH_W} ${y1} H ${mx} V ${y2} H ${ncx}`);
    }
  }

  // Losers bracket internal connectors
  for (let ri = 0; ri < lRounds.length - 1; ri++) {
    const count = lRounds[ri].length;
    const nextCount = lRounds[ri + 1].length;
    const cx = colX(ri);
    const ncx = colX(ri + 1);
    const mx = cx + MATCH_W + COL_GAP / 2;
    for (let mi = 0; mi < count; mi++) {
      const y1 = lOffsetY + midY(lH, count, mi);
      const y2 = lOffsetY + midY(lH, nextCount, Math.floor(mi / 2));
      paths.push(`M ${cx + MATCH_W} ${y1} H ${mx} V ${y2} H ${ncx}`);
    }
  }

  // Winners finalist → grand finals (top feed)
  if (wRounds.length > 0) {
    const lastWCol = colX(wRounds.length - 1);
    const wFinalY = wOffsetY + midY(wH, 1, 0);
    const mx = lastWCol + MATCH_W + COL_GAP / 2;
    const gfMidY = gfY + MATCH_H / 4; // top slot of GF card
    paths.push(`M ${lastWCol + MATCH_W} ${wFinalY} H ${mx} V ${gfMidY} H ${gfColX}`);
  }

  // Losers finalist → grand finals (bottom feed)
  if (lRounds.length > 0) {
    const lastLCol = colX(lRounds.length - 1);
    const lFinalY = lOffsetY + midY(lH, 1, 0);
    const mx = lastLCol + MATCH_W + COL_GAP / 2;
    const gfMidY = gfY + (MATCH_H * 3) / 4; // bottom slot of GF card
    paths.push(`M ${lastLCol + MATCH_W} ${lFinalY} H ${mx} V ${gfMidY} H ${gfColX}`);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="flex items-center gap-4 p-6 pb-2">
        <button onClick={() => router.push("/")} className="text-gray-400 hover:text-white text-sm">
          ← New Bracket
        </button>
        <h1 className="text-2xl font-bold">Double Elimination</h1>
      </div>

      {state.champion && (
        <div className="text-center py-3">
          <span className="inline-block bg-yellow-500 text-black font-bold px-6 py-2 rounded-lg">
            🏆 Champion: {state.champion.name}
          </span>
        </div>
      )}

      <div className="overflow-x-auto p-6 pt-4">
        <div className="relative" style={{ width: totalW, height: totalH + 28 }}>

          {/* Section labels */}
          <div className="absolute text-xs font-semibold text-blue-400"
            style={{ top: wOffsetY, left: 0, transform: "translateY(-20px)" }}>
            Winners Bracket
          </div>
          <div className="absolute text-xs font-semibold text-red-400"
            style={{ top: lOffsetY, left: 0, transform: "translateY(-20px)" }}>
            Losers Bracket
          </div>
          <div className="absolute text-xs font-semibold text-yellow-400"
            style={{ left: gfColX, top: gfY - 20, width: MATCH_W, textAlign: "center" }}>
            Grand Finals
          </div>

          {/* SVG connector lines */}
          <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH + 28}>
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={1.5} />
            ))}
          </svg>

          {/* Winners rounds */}
          {wRounds.map((round, ri) => {
            const count = round.length;
            const cx = colX(ri);
            return (
              <div key={`w${ri}`}>
                <div className="absolute text-xs text-gray-500 text-center"
                  style={{ left: cx, top: wOffsetY - 16, width: MATCH_W }}>
                  Round {ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute"
                    style={{ left: cx, top: wOffsetY + cardY(wH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin} />
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
                <div className="absolute text-xs text-gray-500 text-center"
                  style={{ left: cx, top: lOffsetY - 16, width: MATCH_W }}>
                  Round {ri + 1}
                </div>
                {round.map((id, mi) => (
                  <div key={id} className="absolute"
                    style={{ left: cx, top: lOffsetY + cardY(lH, count, mi) }}>
                    <MatchCard match={state.matches[id]} state={state} onWin={handleWin} />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Grand Finals */}
          {gf && (
            <div className="absolute" style={{ left: gfColX, top: gfY }}>
              <MatchCard match={gf} state={state} onWin={handleWin} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function MatchCard({ match, state, onWin }: {
  match: Match; state: BracketState;
  onWin: (id: string, wid: string) => void;
}) {
  const p1 = resolvePlayer(state, match, "p1");
  const p2 = resolvePlayer(state, match, "p2");
  const canPlay = !match.winner && !!p1 && !!p2;

  return (
    <div className="border border-gray-700 rounded overflow-hidden bg-gray-900"
      style={{ width: MATCH_W, height: MATCH_H }}>
      {([p1, p2] as const).map((player, i) => {
        const isWinner = match.winner?.id === player?.id;
        const isLoser = match.loser?.id === player?.id;
        return (
          <button
            key={i}
            disabled={!canPlay || !player}
            onClick={() => player && canPlay && onWin(match.id, player.id)}
            style={{ height: MATCH_H / 2 }}
            className={[
              "w-full text-left px-2 text-xs flex items-center justify-between transition",
              i === 0 ? "border-b border-gray-700" : "",
              isWinner ? "bg-green-900 text-green-300 font-semibold" : "text-gray-200",
              isLoser ? "bg-gray-800 text-gray-500 line-through" : "",
              canPlay && player ? "hover:bg-gray-700 cursor-pointer" : "cursor-default",
            ].filter(Boolean).join(" ")}
          >
            <span className="truncate max-w-[130px]">
              {player
                ? <>{player.seed && <span className="text-yellow-500 mr-1">[{player.seed}]</span>}{player.name}</>
                : <span className="text-gray-600 italic">TBD</span>}
            </span>
            {isWinner && <span className="text-green-400 ml-1">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
