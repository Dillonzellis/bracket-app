import { BracketState } from "./bracket";

export type TournamentRecord = {
  id: string;
  name: string;
  createdAt: number;
  defaultFormat: 3 | 5;
  state: BracketState;
};

const KEY = "tournaments";

function load(): Record<string, TournamentRecord> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}

function save(data: Record<string, TournamentRecord>) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getTournaments(): TournamentRecord[] {
  return Object.values(load()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getTournament(id: string): TournamentRecord | null {
  return load()[id] ?? null;
}

export function saveTournament(record: TournamentRecord): void {
  const data = load();
  data[record.id] = record;
  save(data);
}

export function deleteTournament(id: string): void {
  const data = load();
  delete data[id];
  save(data);
}
