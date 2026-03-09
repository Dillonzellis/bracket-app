import { createClient } from "@/utils/supabase/client";
import { BracketState } from "./bracket";

export type TournamentRecord = {
  id: string;
  name: string;
  createdAt: number;
  defaultFormat: 3 | 5;
  state: BracketState;
};

function toRow(r: TournamentRecord) {
  return { id: r.id, name: r.name, created_at: r.createdAt, default_format: r.defaultFormat, state: r.state };
}

function fromRow(row: any): TournamentRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at, defaultFormat: row.default_format, state: row.state };
}

export async function getTournaments(): Promise<TournamentRecord[]> {
  const supabase = createClient();
  const { data } = await supabase.from("tournaments").select().order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
}

export async function getTournament(id: string): Promise<TournamentRecord | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tournaments").select().eq("id", id).single();
  return data ? fromRow(data) : null;
}

export async function saveTournament(record: TournamentRecord): Promise<void> {
  const supabase = createClient();
  await supabase.from("tournaments").upsert(toRow(record));
}

export async function deleteTournament(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("tournaments").delete().eq("id", id);
}
