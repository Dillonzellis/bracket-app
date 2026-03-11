import { createClient } from "@/utils/supabase/client";
import { BracketState } from "./bracket";

export type TournamentRecord = {
  id: string;
  name: string;
  createdAt: number;
  defaultFormat: 3 | 5;
  state: BracketState;
};

const LS_KEY = "ssbm_bracket_tournaments";
const DEBUG_KEY = "ssbm_bracket_debugMode";

const TTL_MS = 30_000;
let tournamentsCache: { data: TournamentRecord[]; expiresAt: number } | null = null;

function invalidateCache() { tournamentsCache = null; }

export function isDebugMode() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEBUG_KEY) === "true";
}

export function setDebugMode(val: boolean) {
  localStorage.setItem(DEBUG_KEY, String(val));
}

function lsLoad(): Record<string, TournamentRecord> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}

function lsSave(data: Record<string, TournamentRecord>) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function toRow(r: TournamentRecord) {
  return { id: r.id, name: r.name, created_at: r.createdAt, default_format: r.defaultFormat, state: r.state };
}

function fromRow(row: any): TournamentRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at, defaultFormat: row.default_format, state: row.state };
}

export async function getTournaments(): Promise<TournamentRecord[]> {
  if (tournamentsCache && Date.now() < tournamentsCache.expiresAt) return tournamentsCache.data;
  if (isDebugMode()) {
    const data = Object.values(lsLoad()).sort((a, b) => b.createdAt - a.createdAt);
    tournamentsCache = { data, expiresAt: Date.now() + TTL_MS };
    return data;
  }
  const supabase = createClient();
  const { data } = await supabase.from("tournaments").select().order("created_at", { ascending: false });
  const result = (data ?? []).map(fromRow);
  tournamentsCache = { data: result, expiresAt: Date.now() + TTL_MS };
  return result;
}

export async function getTournament(id: string): Promise<TournamentRecord | null> {
  if (isDebugMode()) return lsLoad()[id] ?? null;
  const supabase = createClient();
  const { data } = await supabase.from("tournaments").select().eq("id", id).single();
  return data ? fromRow(data) : null;
}

export async function saveTournament(record: TournamentRecord): Promise<void> {
  invalidateCache();
  if (isDebugMode()) { const d = lsLoad(); d[record.id] = record; lsSave(d); return; }
  const supabase = createClient();
  await supabase.from("tournaments").upsert(toRow(record));
}

export async function deleteTournament(id: string): Promise<void> {
  invalidateCache();
  if (isDebugMode()) { const d = lsLoad(); delete d[id]; lsSave(d); return; }
  const supabase = createClient();
  await supabase.from("tournaments").delete().eq("id", id);
}
