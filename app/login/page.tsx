"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={login} className="w-full max-w-sm space-y-3 font-mono">
        <button type="button" onClick={() => router.push("/")}
          className="text-sm font-mono text-[var(--text-dim)] hover:text-[#39ff14] transition-colors mb-2">
          ◀ BACK
        </button>
        <div className="text-lg tracking-widest font-bold text-[var(--text)] mb-6">⚡ ADMIN LOGIN</div>
        <input className="w-full px-2 py-2 text-base" placeholder="Email"
          type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="w-full px-2 py-2 text-base" placeholder="Password"
          type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <div className="text-sm text-[#e8001c]">{error}</div>}
        <button type="submit" className="w-full py-2 text-sm tracking-widest font-bold"
          style={{ border: "1px solid #39ff14", color: "#000", background: "#39ff14" }}>
          LOGIN
        </button>
      </form>
    </main>
  );
}
