"use client";

import { useState, useTransition, Dispatch, SetStateAction } from "react";
import { addEntrant, updateEntrant, deleteEntrant } from "@/lib/db";

type Entrant = { id: string; name: string };

export default function EntrantsSection({
  entrants,
  setEntrants,
  isAdmin,
}: {
  entrants: Entrant[];
  setEntrants: Dispatch<SetStateAction<Entrant[]>>;
  isAdmin: boolean;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const atLimit = entrants.length >= 100;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addEntrant(input);
      if (result.error) {
        setError(result.error);
      } else {
        setEntrants((prev) => [...prev, { id: result.id!, name: input.trim() }]);
        setInput("");
      }
    });
  };

  const startEdit = (e: Entrant) => {
    setEditingId(e.id);
    setEditValue(e.name);
    setError(null);
  };

  const saveEdit = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await updateEntrant(id, editValue);
      if (result.error) {
        setError(result.error);
      } else {
        setEntrants((prev) => prev.map((e) => (e.id === id ? { ...e, name: editValue.trim() } : e)));
        setEditingId(null);
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await deleteEntrant(id);
      if (!result.error) setEntrants((prev) => prev.filter((e) => e.id !== id));
    });
  };

  return (
    <>
      <div className="text-sm mb-2 text-[var(--text-dim)]">&gt; ENTRANTS {isAdmin && `(${entrants.length}/100)`}</div>

      {!atLimit && (
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 px-2 py-1.5 text-base"
            placeholder="Enter name"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={50}
          />
          <button
            onClick={submit}
            disabled={isPending}
            className="px-4 py-1.5 text-sm font-mono border border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black transition-colors disabled:opacity-50"
          >
            ADD
          </button>
        </div>
      )}

      {error && <div className="text-xs text-[#e8001c] mb-2 font-mono">{error}</div>}
      {atLimit && <div className="text-xs text-[#f0c000] mb-2 font-mono">Entrant limit of 100 reached.</div>}

      {entrants.length > 0 && (
        <ol className="space-y-1">
          {entrants.map((e, i) => (
            <li key={e.id} className="flex items-center gap-2 font-mono text-sm">
              <span className="w-5 text-right text-[var(--text-dim)] shrink-0">{i + 1}.</span>
              {editingId === e.id ? (
                <>
                  <input
                    className="flex-1 px-2 py-0.5 text-sm"
                    value={editValue}
                    onChange={(ev) => setEditValue(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") saveEdit(e.id);
                      if (ev.key === "Escape") setEditingId(null);
                    }}
                    maxLength={50}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(e.id)} disabled={isPending} className="text-xs text-[#39ff14] hover:opacity-70 disabled:opacity-50">✓</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-[var(--text-dim)] hover:text-[var(--text)]">✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-[var(--text)]">{e.name}</span>
                  {isAdmin && (
                    <>
                      <button onClick={() => startEdit(e)} className="text-xs text-[var(--text-dim)] hover:text-[#39ff14] transition-colors">✎</button>
                      <button onClick={() => remove(e.id)} disabled={isPending} className="text-xs text-[var(--text-dim)] hover:text-[#e8001c] transition-colors disabled:opacity-50">✕</button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
