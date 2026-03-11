"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { getTournament } from "@/lib/db";
import { getStandings } from "@/lib/bracket";
import ResultsScreen from "../ResultsScreen";

export default function ResultsPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const skip = searchParams.get("skip") === "1";
  const [data, setData] = useState<{ first: string; second: string; third: string } | null>(null);

  useEffect(() => {
    getTournament(id).then(t => {
      if (!t?.state.champion) { router.replace(`/bracket/${id}`); return; }
      const s = getStandings(t.state);
      const get = (place: string) => s.find(x => x.place === place || x.place === `T-${place}`)?.player;
      const p1 = get("1st") ?? t.state.champion;
      const p2 = get("2nd");
      const p3 = get("3rd");
      if (!p2 || !p3) { router.replace(`/bracket/${id}`); return; }
      setData({ first: p1.name, second: p2.name, third: p3.name });
    });
  }, [id, router]);

  if (!data) return <div className="fixed inset-0" style={{ background: "#050810" }} />;

  return (
    <ResultsScreen
      first={{ name: data.first }}
      second={{ name: data.second }}
      third={{ name: data.third }}
      initialStage={skip ? 4 : undefined}
      onClose={() => router.push(`/bracket/${id}`)}
    />
  );
}
