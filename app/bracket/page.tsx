"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BracketState, Match, generateBracket, reportResult, resolvePlayer,
} from "@/lib/bracket";

const MATCH_W = 176;
const MATCH_H = 56;
const COL_GAP = 60;
const ROW_GAP = 12;

// Compute Y center of each match in a round given total height and match count
function matchY(totalH: number, count: number, index: number): number {
  const sliceH = totalH / count;
  return sliceH * index + (sliceH - MATCH_H) / 2;
}

function sectionHeight(firstRoundCount: number): number {
  return firstRoundCount * MATCH_H + (firstRoundCount - 1) * ROW_GAP;
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

      <div className="overflow-x-auto p-6 pt-3">
        <div className="flex flex-col gap-12" style={{ minWidth: "max-content" }}>
          <BracketSection label="Winners Bracket" labelColor="#60a5fa"
            roundIds={state.winnersRounds} state={state} onWin={handleWin} />
          <BracketSection label="Losers Bracket" labelColor="#f87171"
            roundIds={state.losersRounds} state={state} onWin={handleWin} />
          {gf && (
            <div>
              <div className="text-sm font-semibold mb-3" style={{ color: "#fbbf24" }}>Grand Finals</div>
              <MatchCard match={gf} state={state} onWin={handleWin} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function BracketSection({ label, labelColor, roundIds, state, onWin }: {
  label: string; labelColor: string;
  roundIds: string[][]; state: BracketState;
  onWin: (id: string, wid: string) => void;
}) {
  if (roundIds.length === 0) return null;

  const firstCount = roundIds[0].length;
  const totalH = sectionHeight(firstCount);
  const totalW = roundIds.length * (MATCH_W + COL_GAP);

  // Build all connector lines as SVG paths
  const lines: { x1: number; y1: number; x2: number; y2: number; mx: number }[] = [];
  for (let ri = 0; ri < roundIds.length - 1; ri++) {
    const count = roundIds[ri].length;
    const nextCount = roundIds[ri + 1].length;
    const colX = ri * (MATCH_W + COL_GAP);
    const nextColX = colX + MATCH_W + COL_GAP;

    for (let mi = 0; mi < count; mi++) {
      const y1 = matchY(totalH, count, mi) + MATCH_H / 2;
      const nextMi = Math.floor(mi / 2);
      const y2 = matchY(totalH, nextCount, nextMi) + MATCH_H / 2;
      const mx = colX + MATCH_W + COL_GAP / 2;
      lines.push({ x1: colX + MATCH_W, y1, x2: nextColX, y2, mx });
    }
  }

  return (
    <div>
      <div className="text-sm font-semibold mb-5" style={{ color: labelColor }}>{label}</div>
      <div className="relative" style={{ height: totalH, width: totalW }}>

        {/* Single SVG for all connector lines */}
        <svg className="absolute inset-0 pointer-events-none" width={totalW} height={totalH}>
          {lines.map((l, i) => (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} H ${l.mx} V ${l.y2} H ${l.x2}`}
              fill="none" stroke="#374151" strokeWidth={1.5}
            />
          ))}
        </svg>

        {/* Round labels + match cards */}
        {roundIds.map((round, ri) => {
          const count = round.length;
          const colX = ri * (MATCH_W + COL_GAP);
          return (
            <div key={ri}>
              <div
                className="absolute text-xs text-gray-500 text-center"
                style={{ left: colX, top: -22, width: MATCH_W }}
              >
                Round {ri + 1}
              </div>
              {round.map((id, mi) => (
                <div
                  key={id}
                  className="absolute"
                  style={{ left: colX, top: matchY(totalH, count, mi) }}
                >
                  <MatchCard match={state.matches[id]} state={state} onWin={onWin} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
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
    <div
      className="border border-gray-700 rounded overflow-hidden bg-gray-900"
      style={{ width: MATCH_W, height: MATCH_H }}
    >
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
              {player ? (
                <>
                  {player.seed && <span className="text-yellow-500 mr-1">[{player.seed}]</span>}
                  {player.name}
                </>
              ) : (
                <span className="text-gray-600 italic">TBD</span>
              )}
            </span>
            {isWinner && <span className="text-green-400 ml-1">✓</span>}
          </button>
        );
      })}
    </div>
  );
}
