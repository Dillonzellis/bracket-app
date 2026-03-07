export type Player = {
  id: string;
  name: string;
  seed?: number;
};

export type Match = {
  id: string;
  round: number;
  matchIndex: number;
  p1Source: Player | string | null; // Player = fixed, string = matchId winner
  p2Source: Player | string | null;
  p1SourceLoser?: string;
  p2SourceLoser?: string;
  winner: Player | null;
  loser: Player | null;
  bracket: "winners" | "losers" | "grand-finals";
};

export type BracketState = {
  players: Player[];
  matches: Record<string, Match>;
  winnersRounds: string[][];
  losersRounds: string[][];
  grandFinalsId: string;
  champion: Player | null;
};

function nextPowerOf2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function mid(b: string, r: number, i: number) {
  return `${b}-r${r}-m${i}`;
}

function seededOrder(players: Player[]): Player[] {
  const size = nextPowerOf2(players.length);
  // Fill slots with seeded players first, then unseeded
  const slots: (Player | null)[] = Array(size).fill(null);
  const seeded = players.filter((p) => p.seed && p.seed <= 3).sort((a, b) => a.seed! - b.seed!);
  const unseeded = players.filter((p) => !p.seed || p.seed > 3);
  const seedSlots: Record<number, number> = { 1: 0, 2: size - 1, 3: size / 2 };
  for (const p of seeded) {
    if (seedSlots[p.seed!] !== undefined) slots[seedSlots[p.seed!]] = p;
  }
  let ui = 0;
  for (let i = 0; i < size; i++) {
    if (!slots[i]) slots[i] = unseeded[ui++] ?? null;
  }
  // Return only actual players in their seeded order, nulls removed
  return slots.filter(Boolean) as Player[];
}

export function generateBracket(players: Player[]): BracketState {
  // How many players need a prelim match vs get a bye into main round
  // e.g. 12 players: nextPow2=16, byes=4, prelim players=12-4=8 (4 prelim matches)
  const size = nextPowerOf2(players.length);
  const byeCount = size - players.length;
  const prelimCount = players.length - byeCount; // players who must play in prelim
  const ordered = seededOrder(players);
  const matches: Record<string, Match> = {};
  const winnersRounds: string[][] = [];

  // Top `byeCount` seeds get byes (sit out prelim), rest play prelim
  const byePlayers = ordered.slice(0, byeCount);       // these go straight to main R1
  const prelimPlayers = ordered.slice(byeCount);        // these play prelim

  // --- Prelim round (round 0 visually, but we call it W-R1) ---
  // prelimPlayers are paired: [0,1], [2,3], ...
  const prelimRound: string[] = [];
  for (let i = 0; i < prelimPlayers.length / 2; i++) {
    const id = mid("w", 1, i);
    matches[id] = {
      id, round: 1, matchIndex: i,
      p1Source: prelimPlayers[i * 2],
      p2Source: prelimPlayers[i * 2 + 1],
      winner: null, loser: null,
      bracket: "winners",
    };
    prelimRound.push(id);
  }
  if (prelimRound.length > 0) winnersRounds.push(prelimRound);

  // --- Main round 1: byePlayers + prelim winners, paired ---
  // Slot layout: interleave bye players and prelim match winners so seeding holds
  // bye slots: indices 0..byeCount-1, prelim winners fill the rest
  const mainR1Sources: (Player | string)[] = [];
  let byeIdx = 0;
  let prelimIdx = 0;
  for (let i = 0; i < size / 2; i++) {
    // Alternate: bye player, prelim winner, bye player, prelim winner...
    if (byeIdx < byePlayers.length && (prelimIdx >= prelimRound.length || byeIdx <= prelimIdx)) {
      mainR1Sources.push(byePlayers[byeIdx++]);
    } else {
      mainR1Sources.push(prelimRound[prelimIdx++]);
    }
  }

  const mainR1: string[] = [];
  for (let i = 0; i < mainR1Sources.length / 2; i++) {
    const id = mid("w", winnersRounds.length + 1, i);
    matches[id] = {
      id, round: winnersRounds.length + 1, matchIndex: i,
      p1Source: mainR1Sources[i * 2],
      p2Source: mainR1Sources[i * 2 + 1],
      winner: null, loser: null,
      bracket: "winners",
    };
    mainR1.push(id);
  }
  winnersRounds.push(mainR1);

  // --- Remaining winners rounds ---
  let prevWR = mainR1;
  while (prevWR.length > 1) {
    const round: string[] = [];
    for (let i = 0; i < prevWR.length / 2; i++) {
      const id = mid("w", winnersRounds.length + 1, i);
      matches[id] = {
        id, round: winnersRounds.length + 1, matchIndex: i,
        p1Source: prevWR[i * 2],
        p2Source: prevWR[i * 2 + 1],
        winner: null, loser: null,
        bracket: "winners",
      };
      round.push(id);
    }
    winnersRounds.push(round);
    prevWR = round;
  }

  // --- Losers bracket ---
  // Prelim losers feed L1 (paired), then alternate drop-in + consolidation
  const losersRounds: string[][] = [];

  // L1: prelim losers paired up
  let prevLR: string[] = [];
  if (prelimRound.length > 0) {
    const l1: string[] = [];
    for (let i = 0; i < Math.ceil(prelimRound.length / 2); i++) {
      const id = mid("l", 1, i);
      matches[id] = {
        id, round: 1, matchIndex: i,
        p1Source: null, p2Source: null,
        p1SourceLoser: prelimRound[i * 2],
        p2SourceLoser: prelimRound[i * 2 + 1] ?? undefined,
        winner: null, loser: null,
        bracket: "losers",
      };
      l1.push(id);
    }
    losersRounds.push(l1);
    prevLR = l1;
  }

  // For each subsequent winners round (main R1 onwards), drop losers in then consolidate
  for (let wi = 1; wi < winnersRounds.length; wi++) {
    const wRound = winnersRounds[wi];

    // Pair each W loser with a prevLR survivor.
    // If prevLR is shorter, the extra W losers have no opponent — carry them as free slots
    // directly into the next consolidation rather than creating phantom bye matches.
    const dropRound: string[] = [];
    const bypassSources: string[] = []; // W loser matchIds with no L opponent

    for (let i = 0; i < wRound.length; i++) {
      if (i < prevLR.length) {
        // Real match: L survivor vs W loser
        const id = mid("l", losersRounds.length + 1, i);
        matches[id] = {
          id, round: losersRounds.length + 1, matchIndex: i,
          p1Source: prevLR[i],
          p2Source: null,
          p2SourceLoser: wRound[i],
          winner: null, loser: null,
          bracket: "losers",
        };
        dropRound.push(id);
      } else {
        // No L survivor — W loser bypasses this round
        bypassSources.push(wRound[i]);
      }
    }

    if (dropRound.length > 0) {
      losersRounds.push(dropRound);
      prevLR = dropRound;
    }

    // Consolidation: pair up prevLR winners, also absorbing any bypass W losers
    const conSources: string[] = [...prevLR, ...bypassSources];
    if (conSources.length > 1) {
      const conRound: string[] = [];
      for (let i = 0; i < Math.ceil(conSources.length / 2); i++) {
        const id = mid("l", losersRounds.length + 1, i);
        const src1 = conSources[i * 2];
        const src2 = conSources[i * 2 + 1] ?? null;
        const src1IsWLoser = bypassSources.includes(src1);
        const src2IsWLoser = src2 ? bypassSources.includes(src2) : false;
        matches[id] = {
          id, round: losersRounds.length + 1, matchIndex: i,
          p1Source: src1IsWLoser ? null : src1,
          p1SourceLoser: src1IsWLoser ? src1 : undefined,
          p2Source: src2IsWLoser ? null : src2,
          p2SourceLoser: src2IsWLoser ? src2! : undefined,
          winner: null, loser: null,
          bracket: "losers",
        };
        conRound.push(id);
      }
      losersRounds.push(conRound);
      prevLR = conRound;
    } else if (conSources.length === 1 && bypassSources.length === 1 && dropRound.length === 0) {
      // Only one W loser, no L survivors at all — create a single bye match
      const id = mid("l", losersRounds.length + 1, 0);
      matches[id] = {
        id, round: losersRounds.length + 1, matchIndex: 0,
        p1Source: null, p2Source: null,
        p1SourceLoser: bypassSources[0],
        winner: null, loser: null,
        bracket: "losers",
      };
      losersRounds.push([id]);
      prevLR = [id];
    }
  }

  // --- Grand Finals ---
  const gfId = "grand-finals";
  const lastWR = winnersRounds[winnersRounds.length - 1];
  const lastLR = losersRounds[losersRounds.length - 1];
  matches[gfId] = {
    id: gfId, round: 0, matchIndex: 0,
    p1Source: lastWR[0],
    p2Source: lastLR?.[0] ?? null,
    winner: null, loser: null,
    bracket: "grand-finals",
  };

  const state = { players, matches, winnersRounds, losersRounds, grandFinalsId: gfId, champion: null };

  console.log("[generateBracket] Match wiring:");
  for (const m of Object.values(matches)) {
    const fmt = (src: Player | string | null | undefined, loserSrc?: string) =>
      loserSrc ? `loser(${loserSrc})` : typeof src === "object" ? src?.name ?? "null" : src ?? "null";
    console.log(`  ${m.id.padEnd(20)} p1: ${fmt(m.p1Source, m.p1SourceLoser).padEnd(25)} p2: ${fmt(m.p2Source, m.p2SourceLoser)}`);
  }

  return state;
}

export function resolvePlayer(state: BracketState, match: Match, slot: "p1" | "p2"): Player | null {
  const src = slot === "p1" ? match.p1Source : match.p2Source;
  const loserSrc = slot === "p1" ? match.p1SourceLoser : match.p2SourceLoser;

  if (loserSrc) {
    const resolved = state.matches[loserSrc]?.loser ?? null;
    if (!resolved) console.log(`[TBD] ${match.id} ${slot} waiting on loser of ${loserSrc} (winner: ${state.matches[loserSrc]?.winner?.name ?? "none"}, loser: ${state.matches[loserSrc]?.loser?.name ?? "none"})`);
    return resolved;
  }
  if (src === null || src === undefined) {
    console.log(`[TBD] ${match.id} ${slot} has null source`);
    return null;
  }
  if (typeof src === "object") return src as Player;
  const resolved = state.matches[src]?.winner ?? null;
  if (!resolved) console.log(`[TBD] ${match.id} ${slot} waiting on winner of ${src} (winner: ${state.matches[src]?.winner?.name ?? "none"})`);
  return resolved;
}

// Auto-advance single-player losers matches (bye through), loop until stable
function autoAdvanceByes(state: BracketState) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of Object.values(state.matches)) {
      if (match.winner || match.bracket !== "losers") continue;
      const p1 = resolvePlayer(state, match, "p1");
      const p2 = resolvePlayer(state, match, "p2");
      const p1HasNoSource = !match.p1Source && !match.p1SourceLoser;
      const p2HasNoSource = !match.p2Source && !match.p2SourceLoser;
      if ((p1 && !p2 && p2HasNoSource) || (p2 && !p1 && p1HasNoSource)) {
        match.winner = p1 ?? p2!;
        match.loser = null;
        changed = true;
      }
    }
  }
}

export function reportResult(state: BracketState, matchId: string, winnerId: string): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  const match = next.matches[matchId];
  if (!match || match.winner) return state;

  const p1 = resolvePlayer(next, match, "p1");
  const p2 = resolvePlayer(next, match, "p2");
  console.log(`[reportResult] ${matchId} — p1: ${p1?.name ?? "TBD"}, p2: ${p2?.name ?? "TBD"}, picking winner: ${winnerId}`);
  const winner = p1?.id === winnerId ? p1 : p2?.id === winnerId ? p2 : null;
  if (!winner) {
    console.warn(`[reportResult] winner not found for id ${winnerId} in match ${matchId}`);
    return state;
  }

  match.winner = winner;
  match.loser = winner.id === p1?.id ? p2 ?? null : p1 ?? null;
  console.log(`[reportResult] ${matchId} → winner: ${match.winner.name}, loser: ${match.loser?.name ?? "none"}`);

  if (match.bracket === "grand-finals") next.champion = winner;

  // Cascade: auto-advance any losers matches that now have exactly one player
  autoAdvanceByes(next);

  return next;
}
