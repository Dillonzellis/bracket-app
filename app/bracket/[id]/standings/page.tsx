"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getTournament } from "@/lib/db";
import { getStandings } from "@/lib/bracket";
import type { TournamentRecord } from "@/lib/db";

const PLACE_COLORS: Record<string, string> = {
  "1st": "#f0c000",
  "2nd": "#c0c0c0",
  "3rd": "#cd7f32",
};

function placeColor(place: string) {
  return PLACE_COLORS[place] ?? "var(--text-dim)";
}

export default function StandingsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<TournamentRecord | null>(null);

  useEffect(() => {
    getTournament(id).then(t => {
      if (!t) { router.replace("/"); return; }
      setRecord(t);
    });
  }, [id, router]);

  if (!record) return <div className="fixed inset-0 bg-[var(--bg)]" />;

  const state = record.state;
  const standings = getStandings(state);

  return (
    <main className="min-h-screen bg-[var(--bg)] font-mono">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push(`/bracket/${id}`)}
          className="text-sm tracking-widest text-[var(--text)] hover:text-[#39ff14] transition-colors shrink-0"
        >
          ◀ BRACKET
        </button>
        <span className="text-base tracking-widest glow text-[var(--text)] truncate flex-1">
          {record.name}
        </span>
        <span className="text-xs tracking-widest text-[var(--text-dim)] shrink-0">STANDINGS</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-8">

        {/* Champion banner */}
        {state.champion && (
          <div className="text-center py-4 border border-[#f0c000] bg-[#1a1a0a]">
            <div className="text-xs tracking-[0.4em] text-[var(--text-dim)] mb-1">TOURNAMENT CHAMPION</div>
            <div
              className="text-2xl font-bold tracking-widest"
              style={{ color: "#f0c000", textShadow: "0 0 16px #f0c000, 0 0 40px #f0c00066" }}
            >
              ★ {state.champion.name} ★
            </div>
          </div>
        )}

        {/* Standings */}
        <section>
          <div className="text-xs tracking-[0.4em] text-[var(--text-dim)] mb-3">FINAL STANDINGS</div>
          <div className="border border-[var(--border)] divide-y divide-[var(--border)]">
            {standings.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--text-dim)] italic">No results yet</div>
            ) : (
              standings.map((s, i) => {
                const color = placeColor(s.place);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-4 py-2"
                    style={{ background: `${color}08` }}
                  >
                    <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color }}>
                      {s.place}
                    </span>
                    <span
                      className="text-sm tracking-wide"
                      style={{ color: i < 3 ? color : "var(--text)", textShadow: i < 3 ? `0 0 8px ${color}66` : undefined }}
                    >
                      {s.player.name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
