export type Player = {
  id: string;
  name: string;
  seed?: number;
};

export type Game = { winner: "p1" | "p2" };

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
  format?: 3 | 5;
  games?: Game[];
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

function buildOrder(n: number): number[] {
  if (n === 2) return [1, 2];
  const prev = buildOrder(n / 2);
  const result: number[] = [];
  prev.forEach((s, i) => {
    const comp = n + 1 - s;
    if (i % 2 === 0) result.push(s, comp);
    else result.push(comp, s);
  });
  return result;
}

function seededOrder(players: Player[]): Player[] {
  const size = nextPowerOf2(players.length);
  const order = buildOrder(size);

  const bySeed: Record<number, Player> = {};
  for (const p of players) if (p.seed) bySeed[p.seed] = p;
  const unseeded = players.filter(p => !p.seed);
  let ui = 0;

  const result: Player[] = [];
  for (let i = 0; i < size; i++) {
    const s = order[i];
    if (s <= players.length) {
      result.push(bySeed[s] ?? unseeded[ui++]);
    }
  }
  return result;
}

export function generateBracket(players: Player[]): BracketState {
  const size = nextPowerOf2(players.length);
  const ordered = seededOrder(players); // players in slot order, phantoms omitted
  const fullOrder = buildOrder(size);   // seed numbers for all size slots
  const matches: Record<string, Match> = {};
  const winnersRounds: string[][] = [];

  // Build a slot array: for each of the `size` slots, either a Player or null (phantom).
  // `ordered` lists real players in slot order (phantoms already skipped), so we can
  // reconstruct by walking fullOrder and assigning from ordered sequentially.
  const slots: (Player | null)[] = [];
  let oi = 0;
  for (let i = 0; i < size; i++) {
    slots[i] = fullOrder[i] <= players.length ? ordered[oi++] : null;
  }

  // --- Winners prelim round ---
  // Real-vs-real slot pairs become prelim matches.
  // Real-vs-phantom pairs: the real player gets a bye into W-R1.
  const prelimRound: string[] = [];
  const mainR1Sources: (Player | string)[] = []; // one per W-R1 match
  let prelimIdx = 0;
  for (let i = 0; i < size / 2; i++) {
    const p1 = slots[i * 2], p2 = slots[i * 2 + 1];
    if (p1 && p2) {
      // Both real — prelim match
      const id = mid("w", 1, prelimIdx++);
      matches[id] = { id, round: 1, matchIndex: prelimIdx - 1, p1Source: p1, p2Source: p2, winner: null, loser: null, bracket: "winners" };
      prelimRound.push(id);
      mainR1Sources.push(id); // winner feeds W-R1
    } else {
      // One phantom — real player gets bye directly into W-R1
      mainR1Sources.push((p1 ?? p2)!);
    }
  }
  if (prelimRound.length > 0) winnersRounds.push(prelimRound);
  const numPrelim = prelimRound.length;

  // --- Winners main R1 ---
  const mainR1: string[] = [];
  for (let i = 0; i < mainR1Sources.length / 2; i++) {
    const id = mid("w", winnersRounds.length + 1, i);
    matches[id] = {
      id, round: winnersRounds.length + 1, matchIndex: i,
      p1Source: mainR1Sources[i * 2],
      p2Source: mainR1Sources[i * 2 + 1],
      winner: null, loser: null, bracket: "winners",
    };
    mainR1.push(id);
  }
  winnersRounds.push(mainR1);

  let prevWR = mainR1;
  while (prevWR.length > 1) {
    const round: string[] = [];
    for (let i = 0; i < prevWR.length / 2; i++) {
      const id = mid("w", winnersRounds.length + 1, i);
      matches[id] = {
        id, round: winnersRounds.length + 1, matchIndex: i,
        p1Source: prevWR[i * 2], p2Source: prevWR[i * 2 + 1],
        winner: null, loser: null, bracket: "winners",
      };
      round.push(id);
    }
    winnersRounds.push(round);
    prevWR = round;
  }

  // --- Losers bracket ---
  // Standard DE structure: each W round's losers drop into L, then survivors consolidate.
  //
  // L-R1 (drop): pair each prelim loser 1:1 with a W-R2 loser.
  //   - numPrelim prelim losers, size/2 W-R2 losers.
  //   - First numPrelim W-R2 losers each face a prelim loser.
  //   - Remaining (size/2 - numPrelim) W-R2 losers get a bye into L-R2.
  // L-R2 (consolidation): L-R1 winners pair up; bye W-R2 losers slot in.
  // Then for each subsequent W round: drop round (L survivors vs W losers), then consolidation.

  const losersRounds: string[][] = [];
  let prevLR: string[] = [];

  const mainR1Round = winnersRounds[numPrelim > 0 ? 1 : 0];
  // hasPrelimRound is true only when there's a separate prelim round AND a main R1
  // (i.e. not all W-R1 matches are prelims, which happens for power-of-2 counts)
  const hasPrelimRound = numPrelim > 0 && winnersRounds.length > 1 && winnersRounds[0].length < mainR1Round.length;

  if (hasPrelimRound) {
    // L-R1: pair each prelim loser 1:1 with the W-mainR1 loser from the same slot.
    // If numPrelim > mainR1Round.length (e.g. n=8 where all W-R1 are prelims),
    // extra prelim losers have no W-R1 opponent and bypass into L-R2 consolidation.
    const numL1 = Math.min(numPrelim, mainR1Round.length);
    const byePrelimLosers = prelimRound.slice(numL1); // prelim losers with no W-R1 opponent
    const l1: string[] = [];
    for (let i = 0; i < numL1; i++) {
      const id = mid("l", 1, i);
      matches[id] = {
        id, round: 1, matchIndex: i,
        p1Source: null, p2Source: null,
        p1SourceLoser: prelimRound[i],
        p2SourceLoser: mainR1Round[i],
        winner: null, loser: null, bracket: "losers",
      };
      l1.push(id);
    }
    if (l1.length > 0) { losersRounds.push(l1); prevLR = l1; }

    // W-mainR1 losers with no prelim opponent bypass L-R1
    const byeWLosers = mainR1Round.slice(numL1);
    // All bypass sources (both prelim losers and W losers that skipped L-R1)
    const allByeSources = [...byePrelimLosers, ...byeWLosers];

    // L-R2 consolidation: L-R1 winners + all bypass sources
    const conSourcesFinal: string[] = [...prevLR, ...allByeSources];
    if (conSourcesFinal.length > 1) {
      const l2: string[] = [];
      for (let i = 0; i < Math.ceil(conSourcesFinal.length / 2); i++) {
        const src1 = conSourcesFinal[i * 2];
        const src2 = conSourcesFinal[i * 2 + 1] ?? null;
        const id = mid("l", losersRounds.length + 1, i);
        const src1IsBye = allByeSources.includes(src1);
        const src2IsBye = src2 ? allByeSources.includes(src2) : false;
        matches[id] = {
          id, round: losersRounds.length + 1, matchIndex: i,
          p1Source: src1IsBye ? null : src1,
          p1SourceLoser: src1IsBye ? src1 : undefined,
          p2Source: src2IsBye ? null : (src2 ?? null),
          p2SourceLoser: src2IsBye ? src2! : undefined,
          winner: null, loser: null, bracket: "losers",
        };
        l2.push(id);
      }
      losersRounds.push(l2);
      prevLR = l2;
    }

    // Continue with W rounds after mainR1 (wi=2 onwards in winnersRounds)
    for (let wi = 2; wi < winnersRounds.length; wi++) {
      const wRound = winnersRounds[wi];
      // Drop round: each L survivor vs a W loser
      const dropRound: string[] = [];
      for (let i = 0; i < wRound.length; i++) {
        const id = mid("l", losersRounds.length + 1, i);
        matches[id] = {
          id, round: losersRounds.length + 1, matchIndex: i,
          p1Source: prevLR[i],
          p2Source: null,
          p2SourceLoser: wRound[i],
          winner: null, loser: null, bracket: "losers",
        };
        dropRound.push(id);
      }
      if (dropRound.length > 0) { losersRounds.push(dropRound); prevLR = dropRound; }

      // Consolidation
      const con: string[] = [...prevLR];
      if (con.length > 1) {
        const conRound: string[] = [];
        for (let i = 0; i < Math.ceil(con.length / 2); i++) {
          const src1 = con[i * 2], src2 = con[i * 2 + 1] ?? null;
          const id = mid("l", losersRounds.length + 1, i);
          matches[id] = {
            id, round: losersRounds.length + 1, matchIndex: i,
            p1Source: src1, p2Source: src2,
            winner: null, loser: null, bracket: "losers",
          };
          conRound.push(id);
        }
        losersRounds.push(conRound);
        prevLR = conRound;
      }
    }
  } else {
    // No prelims (power-of-2 player count) — standard alternating drop/consolidate.
    // Process all W rounds including the winners final — its loser drops into the last L round.
    const wLimit = winnersRounds.length;
    for (let wi = 0; wi < wLimit; wi++) {
      const wRound = winnersRounds[wi];
      const dropRound: string[] = [];
      const bypassWLosers: string[] = [];
      for (let i = 0; i < wRound.length; i++) {
        if (i < prevLR.length) {
          const id = mid("l", losersRounds.length + 1, i);
          matches[id] = {
            id, round: losersRounds.length + 1, matchIndex: i,
            p1Source: prevLR[i], p2Source: null, p2SourceLoser: wRound[i],
            winner: null, loser: null, bracket: "losers",
          };
          dropRound.push(id);
        } else {
          bypassWLosers.push(wRound[i]);
        }
      }
      if (dropRound.length > 0) { losersRounds.push(dropRound); prevLR = dropRound; }
      const con: string[] = [...prevLR, ...bypassWLosers];
      if (con.length > 1) {
        const conRound: string[] = [];
        for (let i = 0; i < Math.ceil(con.length / 2); i++) {
          const src1 = con[i * 2], src2 = con[i * 2 + 1] ?? null;
          const id = mid("l", losersRounds.length + 1, i);
          const s1bye = bypassWLosers.includes(src1);
          const s2bye = src2 ? bypassWLosers.includes(src2) : false;
          matches[id] = {
            id, round: losersRounds.length + 1, matchIndex: i,
            p1Source: s1bye ? null : src1, p1SourceLoser: s1bye ? src1 : undefined,
            p2Source: s2bye ? null : src2, p2SourceLoser: s2bye ? src2! : undefined,
            winner: null, loser: null, bracket: "losers",
          };
          conRound.push(id);
        }
        losersRounds.push(conRound);
        prevLR = conRound;
      } else if (con.length === 1 && bypassWLosers.includes(con[0])) {
        // Single bypass loser with no L survivors — wrap in a bye-holder so GF has a valid L source
        const src = con[0];
        const id = mid("l", losersRounds.length + 1, 0);
        matches[id] = {
          id, round: losersRounds.length + 1, matchIndex: 0,
          p1Source: null, p1SourceLoser: src,
          p2Source: null,
          winner: null, loser: null, bracket: "losers",
        };
        losersRounds.push([id]);
        prevLR = [id];
      }
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
    winner: null, loser: null, bracket: "grand-finals",
  };

  const state = { players, matches, winnersRounds, losersRounds, grandFinalsId: gfId, champion: null };

  return state;
}

export function resolvePlayer(state: BracketState, match: Match, slot: "p1" | "p2"): Player | null {
  const src = slot === "p1" ? match.p1Source : match.p2Source;
  const loserSrc = slot === "p1" ? match.p1SourceLoser : match.p2SourceLoser;

  if (loserSrc) {
    const resolved = state.matches[loserSrc]?.loser ?? null;

    return resolved;
  }
  if (src === null || src === undefined) {

    return null;
  }
  if (typeof src === "object") return src as Player;
  const resolved = state.matches[src]?.winner ?? null;

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

export function addPlayerToLosers(state: BracketState, player: Player): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  const newPlayer = { ...player, id: `late-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  next.players = [...next.players, newPlayer];

  // Find the latest losers round that hasn't started (no winners yet)
  let insertRoundIdx = -1;
  for (let i = next.losersRounds.length - 1; i >= 0; i--) {
    const started = next.losersRounds[i].some(id => next.matches[id].winner);
    if (!started) insertRoundIdx = i;
    else break;
  }
  if (insertRoundIdx === -1) insertRoundIdx = next.losersRounds.length - 1;

  // Find the most recent completed winners match to use as opponent source
  const completedWMatch = [...next.winnersRounds].reverse().flat()
    .find(id => next.matches[id].winner);

  const newMatchId = `l-late-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  console.log(`[lateEntry] ${newPlayer.name} → new match ${newMatchId} in L-R${insertRoundIdx + 1}, vs loser of ${completedWMatch ?? "none (bye)"}`);

  next.matches[newMatchId] = {
    id: newMatchId, round: insertRoundIdx + 1, matchIndex: next.losersRounds[insertRoundIdx].length,
    p1Source: newPlayer,
    p2Source: null,
    p2SourceLoser: completedWMatch,
    winner: null, loser: null,
    bracket: "losers",
  };

  next.losersRounds[insertRoundIdx] = [...next.losersRounds[insertRoundIdx], newMatchId];

  // Wire winner of new match into the next round.
  // Try to redirect an existing unoccupied string-source slot first.
  // If all slots in the next round are taken, create a new consolidation match.
  const nextRoundIdx = insertRoundIdx + 1;
  const nextRound = next.losersRounds[nextRoundIdx];
  let wired = false;
  if (nextRound) {
    for (const id of nextRound) {
      const m = next.matches[id];
      if (m.winner) continue;
      if (typeof m.p1Source === "string" && !m.p1Source.startsWith("l-late-") && !m.p1SourceLoser) {
        console.log(`[lateEntry] wiring ${newMatchId} winner → p1 of ${id}`);
        m.p1Source = newMatchId; wired = true; break;
      }
      if (typeof m.p2Source === "string" && !m.p2Source.startsWith("l-late-") && !m.p2SourceLoser) {
        console.log(`[lateEntry] wiring ${newMatchId} winner → p2 of ${id}`);
        m.p2Source = newMatchId; wired = true; break;
      }
    }
  }

  if (!wired && nextRound) {
    // All next-round slots occupied — pair this new match's winner against the last match
    // in the next round (which is likely another late-entry match)
    const lastInNext = nextRound[nextRound.length - 1];
    const bridgeId = `l-late-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log(`[lateEntry] creating bridge match ${bridgeId} pairing ${newMatchId} vs ${lastInNext}`);
    // Remove lastInNext from nextRound and replace with bridgeId
    next.losersRounds[nextRoundIdx] = [...nextRound.slice(0, -1), bridgeId];
    next.matches[bridgeId] = {
      id: bridgeId, round: nextRoundIdx + 1, matchIndex: nextRound.length - 1,
      p1Source: lastInNext,
      p2Source: newMatchId,
      winner: null, loser: null,
      bracket: "losers",
    };
    // Re-wire anything that pointed to lastInNext to now point to bridgeId
    for (const m of Object.values(next.matches)) {
      if (m.id === bridgeId) continue;
      if (m.p1Source === lastInNext) m.p1Source = bridgeId;
      if (m.p2Source === lastInNext) m.p2Source = bridgeId;
    }
  }

  // No W opponent available — auto-advance as bye
  if (!completedWMatch) {
    next.matches[newMatchId].winner = newPlayer;
    next.matches[newMatchId].loser = null;
  }

  return next;
}

export function findByeSlots(state: BracketState): { matchId: string; slot: "p1" | "p2" }[] {
  const results: { matchId: string; slot: "p1" | "p2" }[] = [];
  for (const match of Object.values(state.matches)) {
    if (match.winner || match.bracket !== "winners") continue;
    for (const slot of ["p1", "p2"] as const) {
      const src = slot === "p1" ? match.p1Source : match.p2Source;
      const loserSrc = slot === "p1" ? match.p1SourceLoser : match.p2SourceLoser;
      if (src === null && !loserSrc) results.push({ matchId: match.id, slot });
    }
  }
  return results;
}

export function addPlayerToSlot(
  state: BracketState,
  matchId: string,
  slot: "p1" | "p2",
  player: Player
): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  const match = next.matches[matchId];
  if (!match) return state;
  const newPlayer = { ...player, id: `late-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  next.players = [...next.players, newPlayer];
  console.log(`[lateEntry] ${newPlayer.name} → bye slot ${slot} in ${matchId}`);
  if (slot === "p1") match.p1Source = newPlayer;
  else match.p2Source = newPlayer;
  return next;
}

export function countAffectedMatches(state: BracketState, matchId: string): number {
  const visited = new Set<string>();
  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const other of Object.values(state.matches)) {
      if (other.id === id) continue;
      const dep = other.p1Source === id || other.p2Source === id ||
        other.p1SourceLoser === id || other.p2SourceLoser === id;
      if (dep) walk(other.id);
    }
  }
  walk(matchId);
  return visited.size - 1; // exclude the match itself
}

export function undoResult(state: BracketState, matchId: string): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;

  // Recursively clear a match and any downstream matches that depended on it
  function clearMatch(id: string) {
    const m = next.matches[id];
    if (!m || (!m.winner && !m.loser)) return;
    m.winner = null;
    m.loser = null;
    if (id === next.grandFinalsId) next.champion = null;
    // Clear any match that sources its players from this match's winner or loser
    for (const other of Object.values(next.matches)) {
      if (other.id === id) continue;
      const dependsOnWinner = other.p1Source === id || other.p2Source === id;
      const dependsOnLoser = other.p1SourceLoser === id || other.p2SourceLoser === id;
      if (dependsOnWinner || dependsOnLoser) clearMatch(other.id);
    }
  }

  clearMatch(matchId);
  return next;
}

export type Standing = { player: Player; place: string };

export function getStandings(state: BracketState): Standing[] {
  const standings: Standing[] = [];
  if (state.champion) standings.push({ player: state.champion, place: "1st" });
  const gf = state.matches[state.grandFinalsId];
  if (gf?.loser) standings.push({ player: gf.loser, place: "2nd" });

  // Build groups: players eliminated in the same losers round share a placement.
  // Iterate rounds in reverse (last round = highest remaining placement).
  const placeNames = ["3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
  let placeIdx = 0;
  for (const roundIds of [...state.losersRounds].reverse()) {
    const losers = roundIds.map(id => state.matches[id].loser).filter(Boolean) as Player[];
    if (losers.length === 0) continue;
    const place = losers.length === 1
      ? (placeNames[placeIdx] ?? `${placeIdx + 3}th`)
      : `T-${placeNames[placeIdx] ?? `${placeIdx + 3}th`}`;
    losers.forEach(p => standings.push({ player: p, place }));
    placeIdx += losers.length;
  }
  return standings;
}

export function getReadyMatches(state: BracketState): Match[] {
  return Object.values(state.matches).filter(m => {
    if (m.winner) return false;
    const p1 = resolvePlayer(state, m, "p1");
    const p2 = resolvePlayer(state, m, "p2");
    return !!p1 && !!p2;
  });
}

export function disqualifyPlayer(state: BracketState, playerId: string): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  // Find the active (unplayed) match containing this player
  for (const match of Object.values(next.matches)) {
    if (match.winner) continue;
    const p1 = resolvePlayer(next, match, "p1");
    const p2 = resolvePlayer(next, match, "p2");
    const isDQ1 = p1?.id === playerId;
    const isDQ2 = p2?.id === playerId;
    if (!isDQ1 && !isDQ2) continue;
    const winner = isDQ1 ? p2 : p1;
    const loser = isDQ1 ? p1 : p2;
    if (!winner || !loser) continue;
    match.winner = winner;
    match.loser = { ...loser, name: `${loser.name} [DQ]` };
    if (match.bracket === "grand-finals") next.champion = winner;
    autoAdvanceByes(next);
    return next;
  }
  return state;
}

export function movePlayer(
  state: BracketState,
  fromMatchId: string, fromSlot: "p1" | "p2",
  toMatchId: string, toSlot: "p1" | "p2"
): BracketState {
  // Only works when the source slot has a fixed Player (not a match-winner reference)
  let next = JSON.parse(JSON.stringify(state)) as BracketState;
  const from = next.matches[fromMatchId];
  const to = next.matches[toMatchId];
  if (!from || !to) return state;
  const fromSrc = fromSlot === "p1" ? from.p1Source : from.p2Source;
  if (!fromSrc || typeof fromSrc !== "object") return state;
  const toSrc = toSlot === "p1" ? to.p1Source : to.p2Source;
  // Clear results on both affected matches before mutating
  next = undoResult(next, fromMatchId);
  next = undoResult(next, toMatchId);
  const f = next.matches[fromMatchId];
  const t = next.matches[toMatchId];
  // Swap: put fromSrc into destination, put toSrc (or null) back into source
  if (toSlot === "p1") t.p1Source = fromSrc; else t.p2Source = fromSrc;
  if (fromSlot === "p1") f.p1Source = (toSrc && typeof toSrc === "object") ? toSrc : null;
  else f.p2Source = (toSrc && typeof toSrc === "object") ? toSrc : null;
  return next;
}

export function swapPlayers(state: BracketState, matchId: string): BracketState {
  const next = undoResult(JSON.parse(JSON.stringify(state)) as BracketState, matchId);
  const m = next.matches[matchId];
  if (!m) return state;
  [m.p1Source, m.p2Source] = [m.p2Source, m.p1Source];
  [m.p1SourceLoser, m.p2SourceLoser] = [m.p2SourceLoser, m.p1SourceLoser];
  return next;
}

export function renamePlayerInMatch(state: BracketState, matchId: string, slot: "p1" | "p2", name: string): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  const m = next.matches[matchId];
  if (!m) return state;
  const src = slot === "p1" ? m.p1Source : m.p2Source;
  if (!src || typeof src !== "object") return state;
  const updated = { ...src, name };
  if (slot === "p1") m.p1Source = updated;
  else m.p2Source = updated;
  // Update in players list too
  const pi = next.players.findIndex(p => p.id === src.id);
  if (pi >= 0) next.players[pi] = updated;
  return next;
}

export function reportResult(state: BracketState, matchId: string, winnerId: string): BracketState {
  const next = JSON.parse(JSON.stringify(state)) as BracketState;
  const match = next.matches[matchId];
  if (!match || match.winner) return state;

  const p1 = resolvePlayer(next, match, "p1");
  const p2 = resolvePlayer(next, match, "p2");

  const winner = p1?.id === winnerId ? p1 : p2?.id === winnerId ? p2 : null;
  if (!winner) {
    console.warn(`[reportResult] winner not found for id ${winnerId} in match ${matchId}`);
    return state;
  }

  match.winner = winner;
  match.loser = winner.id === p1?.id ? p2 ?? null : p1 ?? null;


  if (match.bracket === "grand-finals") next.champion = winner;

  // Cascade: auto-advance any losers matches that now have exactly one player
  autoAdvanceByes(next);

  return next;
}
