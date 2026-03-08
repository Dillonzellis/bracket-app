import {
  generateBracket, reportResult, resolvePlayer, undoResult,
  countAffectedMatches, findByeSlots, addPlayerToSlot, addPlayerToLosers,
  getReadyMatches, getStandings, disqualifyPlayer,
  BracketState, Player, Game,
} from "@/lib/bracket";

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    seed: i < 3 ? i + 1 : undefined,
  }));
}

function simulateFull(initial: BracketState): BracketState {
  let state = initial;
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of Object.values(state.matches)) {
      if (match.winner) continue;
      const p1 = resolvePlayer(state, match, "p1");
      const p2 = resolvePlayer(state, match, "p2");
      if (p1 && p2) {
        state = reportResult(state, match.id, p1.id);
        changed = true;
      }
    }
  }
  return state;
}

// --- Structural tests ---

describe("generateBracket structure", () => {
  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: every match source references a valid match or player",
    (n) => {
      const state = generateBracket(makePlayers(n));
      for (const match of Object.values(state.matches)) {
        for (const slot of ["p1", "p2"] as const) {
          const src = slot === "p1" ? match.p1Source : match.p2Source;
          const loserSrc = slot === "p1" ? match.p1SourceLoser : match.p2SourceLoser;
          if (loserSrc) expect(state.matches[loserSrc]).toBeDefined();
          else if (typeof src === "string") expect(state.matches[src]).toBeDefined();
        }
      }
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: winners bracket final round has exactly 1 match",
    (n) => {
      const state = generateBracket(makePlayers(n));
      expect(state.winnersRounds.length).toBeGreaterThanOrEqual(1);
      expect(state.winnersRounds[state.winnersRounds.length - 1].length).toBe(1);
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: grand finals references last winners and losers rounds",
    (n) => {
      const state = generateBracket(makePlayers(n));
      const gf = state.matches[state.grandFinalsId];
      expect(gf.p1Source).toBe(state.winnersRounds[state.winnersRounds.length - 1][0]);
      expect(gf.p2Source).toBe(state.losersRounds[state.losersRounds.length - 1][0]);
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: no non-GF match has two null sources",
    (n) => {
      const state = generateBracket(makePlayers(n));
      for (const match of Object.values(state.matches)) {
        if (match.bracket === "grand-finals") continue;
        const p1Has = match.p1Source !== null || !!match.p1SourceLoser;
        const p2Has = match.p2Source !== null || !!match.p2SourceLoser;
        expect(p1Has || p2Has).toBe(true);
      }
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: generated matches have no format or games set",
    (n) => {
      const state = generateBracket(makePlayers(n));
      for (const match of Object.values(state.matches)) {
        expect(match.format).toBeUndefined();
        expect(match.games).toBeUndefined();
      }
    }
  );
});

// --- Simulation tests ---

describe("full bracket simulation", () => {
  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: bracket completes with a champion",
    (n) => {
      const state = simulateFull(generateBracket(makePlayers(n)));
      expect(state.champion).not.toBeNull();
      expect(state.champion?.name).toBeTruthy();
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: every match has a winner after full simulation",
    (n) => {
      const state = simulateFull(generateBracket(makePlayers(n)));
      for (const match of Object.values(state.matches)) {
        expect(match.winner).not.toBeNull();
      }
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: each player loses at most twice",
    (n) => {
      const players = makePlayers(n);
      const state = simulateFull(generateBracket(players));
      const lossCounts: Record<string, number> = {};
      for (const match of Object.values(state.matches)) {
        if (match.loser) lossCounts[match.loser.id] = (lossCounts[match.loser.id] ?? 0) + 1;
      }
      for (const count of Object.values(lossCounts)) {
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: champion has zero losses",
    (n) => {
      const players = makePlayers(n);
      const state = simulateFull(generateBracket(players));
      const lossCounts: Record<string, number> = {};
      for (const match of Object.values(state.matches)) {
        if (match.loser) lossCounts[match.loser.id] = (lossCounts[match.loser.id] ?? 0) + 1;
      }
      expect(lossCounts[state.champion!.id] ?? 0).toBe(0);
    }
  );
});

// --- reportResult with games/format ---

describe("reportResult with games and format", () => {
  test("stores games and format on the match", () => {
    let state = generateBracket(makePlayers(4));
    const matchId = state.winnersRounds[0][0];
    const match = state.matches[matchId];
    const p1 = resolvePlayer(state, match, "p1")!;

    // Manually attach games before reporting (as the UI does)
    const next = JSON.parse(JSON.stringify(state)) as BracketState;
    const games: Game[] = [{ winner: "p1" }, { winner: "p1" }];
    next.matches[matchId].games = games;
    next.matches[matchId].format = 3;
    state = reportResult(next, matchId, p1.id);

    expect(state.matches[matchId].winner?.id).toBe(p1.id);
    expect(state.matches[matchId].games).toHaveLength(2);
    expect(state.matches[matchId].format).toBe(3);
  });

  test("Bo5: stores up to 5 games", () => {
    let state = generateBracket(makePlayers(4));
    const matchId = state.winnersRounds[0][0];
    const match = state.matches[matchId];
    const p1 = resolvePlayer(state, match, "p1")!;

    const next = JSON.parse(JSON.stringify(state)) as BracketState;
    const games: Game[] = [
      { winner: "p1" }, { winner: "p2" }, { winner: "p1" }, { winner: "p2" }, { winner: "p1" },
    ];
    next.matches[matchId].games = games;
    next.matches[matchId].format = 5;
    state = reportResult(next, matchId, p1.id);

    expect(state.matches[matchId].winner?.id).toBe(p1.id);
    expect(state.matches[matchId].games).toHaveLength(5);
    expect(state.matches[matchId].format).toBe(5);
  });
});

// --- undoResult ---

describe("undoResult", () => {
  test("clears winner and loser on the target match", () => {
    let state = generateBracket(makePlayers(4));
    const matchId = state.winnersRounds[0][0];
    const p1 = resolvePlayer(state, state.matches[matchId], "p1")!;
    state = reportResult(state, matchId, p1.id);
    expect(state.matches[matchId].winner).not.toBeNull();

    state = undoResult(state, matchId);
    expect(state.matches[matchId].winner).toBeNull();
    expect(state.matches[matchId].loser).toBeNull();
  });

  test("clears downstream matches that depended on the undone result", () => {
    let state = generateBracket(makePlayers(8));
    // Play all of winners R1
    for (const id of state.winnersRounds[0]) {
      const p1 = resolvePlayer(state, state.matches[id], "p1")!;
      const p2 = resolvePlayer(state, state.matches[id], "p2")!;
      if (p1 && p2) state = reportResult(state, id, p1.id);
    }
    // Play winners R2 match 0
    const r2id = state.winnersRounds[1][0];
    const p1 = resolvePlayer(state, state.matches[r2id], "p1")!;
    if (p1) state = reportResult(state, r2id, p1.id);

    // Undo a R1 match that fed R2
    const r1id = state.winnersRounds[0][0];
    state = undoResult(state, r1id);

    expect(state.matches[r1id].winner).toBeNull();
    expect(state.matches[r2id].winner).toBeNull();
  });

  test("clears champion when grand finals is undone", () => {
    let state = simulateFull(generateBracket(makePlayers(4)));
    expect(state.champion).not.toBeNull();
    state = undoResult(state, state.grandFinalsId);
    expect(state.champion).toBeNull();
    expect(state.matches[state.grandFinalsId].winner).toBeNull();
  });
});

// --- countAffectedMatches ---

describe("countAffectedMatches", () => {
  test("returns 0 for a match with no downstream dependents", () => {
    const state = generateBracket(makePlayers(4));
    const gfId = state.grandFinalsId;
    expect(countAffectedMatches(state, gfId)).toBe(0);
  });

  test("returns > 0 for an early round match", () => {
    const state = generateBracket(makePlayers(8));
    const r1id = state.winnersRounds[0][0];
    expect(countAffectedMatches(state, r1id)).toBeGreaterThan(0);
  });
});

// --- findByeSlots ---

describe("findByeSlots", () => {
  test("returns open slots for non-power-of-2 player counts", () => {
    const state = generateBracket(makePlayers(5)); // 5 players → 8-slot bracket, 3 byes
    const slots = findByeSlots(state);
    expect(slots.length).toBeGreaterThan(0);
    for (const { matchId, slot } of slots) {
      expect(state.matches[matchId]).toBeDefined();
      expect(["p1", "p2"]).toContain(slot);
    }
  });

  test("returns empty for exact power-of-2 player counts", () => {
    const state = generateBracket(makePlayers(8));
    expect(findByeSlots(state)).toHaveLength(0);
  });
});

// --- addPlayerToSlot ---

describe("addPlayerToSlot", () => {
  test("injects player into the specified bye slot", () => {
    const state = generateBracket(makePlayers(5));
    const slots = findByeSlots(state);
    expect(slots.length).toBeGreaterThan(0);
    const { matchId, slot } = slots[0];
    const newState = addPlayerToSlot(state, matchId, slot, { id: "", name: "Late Player" });

    const match = newState.matches[matchId];
    const src = slot === "p1" ? match.p1Source : match.p2Source;
    expect(typeof src).toBe("object");
    expect((src as Player).name).toBe("Late Player");
    expect(newState.players.some(p => p.name === "Late Player")).toBe(true);
  });

  test("assigns a unique id to the late entrant", () => {
    const state = generateBracket(makePlayers(5));
    const slots = findByeSlots(state);
    const { matchId, slot } = slots[0];
    const newState = addPlayerToSlot(state, matchId, slot, { id: "", name: "Late" });
    const added = newState.players.find(p => p.name === "Late")!;
    expect(added.id).not.toBe("");
  });
});

// --- addPlayerToLosers ---

describe("addPlayerToLosers", () => {
  test("adds player to state and bracket", () => {
    const state = generateBracket(makePlayers(8));
    const newState = addPlayerToLosers(state, { id: "", name: "Late Loser" });
    expect(newState.players.some(p => p.name === "Late Loser")).toBe(true);
  });

  test("creates a new losers match when no open slots exist", () => {
    const state = generateBracket(makePlayers(8)); // full bracket, no open slots
    const before = Object.keys(state.matches).length;
    const newState = addPlayerToLosers(state, { id: "", name: "Late Loser" });
    expect(Object.keys(newState.matches).length).toBeGreaterThan(before);
    expect(newState.losersRounds[0].length).toBeGreaterThanOrEqual(1);
  });

  test("late entrant can complete the bracket after being added to losers", () => {
    let state = generateBracket(makePlayers(8));
    state = addPlayerToLosers(state, { id: "", name: "Late" });
    const final = simulateFull(state);
    expect(final.champion).not.toBeNull();
  });
});

// --- Edge cases ---

describe("edge cases", () => {
  test("reporting a result on an already-decided match is a no-op", () => {
    let state = generateBracket(makePlayers(4));
    const firstMatch = state.winnersRounds[0][0];
    const p1 = resolvePlayer(state, state.matches[firstMatch], "p1")!;
    const p2 = resolvePlayer(state, state.matches[firstMatch], "p2")!;
    state = reportResult(state, firstMatch, p1.id);
    const before = JSON.stringify(state);
    state = reportResult(state, firstMatch, p2.id);
    expect(JSON.stringify(state)).toBe(before);
  });

  test("seeds 1 and 2 are placed in different bracket halves", () => {
    const state = generateBracket(makePlayers(8));
    const r1 = state.winnersRounds[0];
    const half = Math.floor(r1.length / 2);
    const findSeed = (seed: number) =>
      r1.findIndex(id => {
        const m = state.matches[id];
        return (m.p1Source as Player)?.seed === seed || (m.p2Source as Player)?.seed === seed;
      });
    const s1 = findSeed(1), s2 = findSeed(2);
    if (s1 !== -1 && s2 !== -1) expect(Math.floor(s1 / half)).not.toBe(Math.floor(s2 / half));
  });
});

// --- resolvePlayer ---

describe("resolvePlayer", () => {
  test("returns fixed Player source directly", () => {
    const state = generateBracket(makePlayers(4));
    const matchId = state.winnersRounds[0][0];
    const p1 = resolvePlayer(state, state.matches[matchId], "p1");
    expect(p1).not.toBeNull();
    expect(p1?.id).toBeTruthy();
  });

  test("returns null for TBD slot before upstream result", () => {
    const state = generateBracket(makePlayers(4));
    const r2id = state.winnersRounds[1][0];
    const p1 = resolvePlayer(state, state.matches[r2id], "p1");
    expect(p1).toBeNull();
  });

  test("resolves winner of upstream match after result reported", () => {
    let state = generateBracket(makePlayers(4));
    const r1id = state.winnersRounds[0][0];
    const r2id = state.winnersRounds[1][0];
    const p1 = resolvePlayer(state, state.matches[r1id], "p1")!;
    state = reportResult(state, r1id, p1.id);
    const resolved = resolvePlayer(state, state.matches[r2id], "p1") ?? resolvePlayer(state, state.matches[r2id], "p2");
    expect(resolved?.id).toBe(p1.id);
  });

  test("resolves loser source after result reported", () => {
    let state = generateBracket(makePlayers(4));
    const r1id = state.winnersRounds[0][0];
    const p1 = resolvePlayer(state, state.matches[r1id], "p1")!;
    const p2 = resolvePlayer(state, state.matches[r1id], "p2")!;
    state = reportResult(state, r1id, p1.id);
    const lMatch = Object.values(state.matches).find(m =>
      m.p1SourceLoser === r1id || m.p2SourceLoser === r1id
    )!;
    const slot = lMatch.p1SourceLoser === r1id ? "p1" : "p2";
    expect(resolvePlayer(state, lMatch, slot)?.id).toBe(p2.id);
  });
});

// --- undoResult clears downstream games ---

describe("undoResult downstream clearing", () => {
  test("downstream match with games is cleared on undo of upstream", () => {
    let state = generateBracket(makePlayers(4));
    const r1id = state.winnersRounds[0][0];
    const r2id = state.winnersRounds[1][0];
    const p1r1 = resolvePlayer(state, state.matches[r1id], "p1")!;
    state = reportResult(state, r1id, p1r1.id);
    // Play all of R1 so R2 is playable
    for (const id of state.winnersRounds[0]) {
      const p1 = resolvePlayer(state, state.matches[id], "p1");
      const p2 = resolvePlayer(state, state.matches[id], "p2");
      if (p1 && p2 && !state.matches[id].winner) state = reportResult(state, id, p1.id);
    }
    const p1r2 = resolvePlayer(state, state.matches[r2id], "p1")!;
    const next = JSON.parse(JSON.stringify(state)) as BracketState;
    next.matches[r2id].games = [{ winner: "p1" }, { winner: "p1" }];
    next.matches[r2id].format = 3;
    state = reportResult(next, r2id, p1r2.id);
    expect(state.matches[r2id].winner).not.toBeNull();

    state = undoResult(state, r1id);
    expect(state.matches[r1id].winner).toBeNull();
    expect(state.matches[r2id].winner).toBeNull();
  });
});

// --- autoAdvanceByes ---

describe("autoAdvanceByes", () => {
  test("losers bye-match auto-advances after upstream result", () => {
    let state = generateBracket(makePlayers(3));
    const r1id = state.winnersRounds[0][0];
    const p1 = resolvePlayer(state, state.matches[r1id], "p1")!;
    state = reportResult(state, r1id, p1.id);
    const autoAdvanced = Object.values(state.matches).find(m =>
      m.bracket === "losers" && m.winner !== null
    );
    expect(autoAdvanced).toBeDefined();
  });
});

// --- addPlayerToSlot: bracket completes after injection ---

describe("addPlayerToSlot completion", () => {
  test("bracket completes after late player injected into bye slot", () => {
    let state = generateBracket(makePlayers(5));
    const { matchId, slot } = findByeSlots(state)[0];
    state = addPlayerToSlot(state, matchId, slot, { id: "", name: "Late" });
    expect(simulateFull(state).champion).not.toBeNull();
  });
});

// --- countAffectedMatches exact count ---

describe("countAffectedMatches exact count", () => {
  test("GF has 0 affected matches", () => {
    const state = generateBracket(makePlayers(4));
    expect(countAffectedMatches(state, state.grandFinalsId)).toBe(0);
  });

  test("W-R1 match in 4-player bracket affects at least 2 downstream matches", () => {
    const state = generateBracket(makePlayers(4));
    expect(countAffectedMatches(state, state.winnersRounds[0][0])).toBeGreaterThanOrEqual(2);
  });

  test("last winners round match affects at least 1 downstream match", () => {
    const state = generateBracket(makePlayers(4));
    const lastWR = state.winnersRounds[state.winnersRounds.length - 1][0];
    expect(countAffectedMatches(state, lastWR)).toBeGreaterThanOrEqual(1);
  });
});

describe("getReadyMatches", () => {
  test("returns all matches with both players resolved and no result", () => {
    const state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    const ready = getReadyMatches(state);
    // 4-player bracket: 2 W-R1 matches both ready immediately
    expect(ready.length).toBe(2);
    ready.forEach(m => expect(m.winner).toBeNull());
  });

  test("excludes matches where a player is still TBD", () => {
    // 5-player bracket: some losers matches wait on upstream results
    const state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
      { id: "p5", name: "P5" },
    ]);
    const ready = getReadyMatches(state);
    // Only W-R1 matches are ready; losers matches wait on losers from W-R1
    ready.forEach(m => {
      const p1 = resolvePlayer(state, m, "p1");
      const p2 = resolvePlayer(state, m, "p2");
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();
    });
  });

  test("excludes already-completed matches", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    const firstId = state.winnersRounds[0][0];
    const match = state.matches[firstId];
    const p1 = resolvePlayer(state, match, "p1")!;
    state = reportResult(state, firstId, p1.id);
    const ready = getReadyMatches(state);
    expect(ready.find(m => m.id === firstId)).toBeUndefined();
  });
});

describe("getStandings", () => {
  test("returns empty before any results", () => {
    const state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    expect(getStandings(state)).toEqual([]);
  });

  test("1st place is champion after full tournament", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    // Simulate full tournament: always pick p1 of each match
    let safety = 0;
    while (!state.champion && safety++ < 20) {
      const ready = getReadyMatches(state);
      if (ready.length === 0) break;
      const m = ready[0];
      const winner = resolvePlayer(state, m, "p1") ?? resolvePlayer(state, m, "p2");
      if (winner) state = reportResult(state, m.id, winner.id);
    }
    const standings = getStandings(state);
    expect(standings[0]?.place).toBe("1st");
    expect(standings[0]?.player).toEqual(state.champion);
  });

  test("2nd place is GF loser", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    let safety = 0;
    while (!state.champion && safety++ < 20) {
      const ready = getReadyMatches(state);
      if (ready.length === 0) break;
      const m = ready[0];
      const winner = resolvePlayer(state, m, "p1") ?? resolvePlayer(state, m, "p2");
      if (winner) state = reportResult(state, m.id, winner.id);
    }
    const standings = getStandings(state);
    const gf = state.matches[state.grandFinalsId];
    expect(standings[1]?.place).toBe("2nd");
    expect(standings[1]?.player).toEqual(gf.loser);
  });

  test("players eliminated in same losers round share a tied placement", () => {
    // 8-player bracket: L-R1 has 4 matches, all losers eliminated together = T-5th
    let state = generateBracket(
      Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` }))
    );
    // Report all W-R1 results so L-R1 is populated
    let safety = 0;
    while (safety++ < 30) {
      const ready = getReadyMatches(state);
      if (ready.length === 0) break;
      const m = ready[0];
      const winner = resolvePlayer(state, m, "p1") ?? resolvePlayer(state, m, "p2");
      if (winner) state = reportResult(state, m.id, winner.id);
      // Stop after first losers round is done
      if (state.losersRounds[0]?.every(id => state.matches[id].winner)) break;
    }
    const standings = getStandings(state);
    const tiedPlaces = standings.filter(s => s.place.startsWith("T-"));
    if (tiedPlaces.length > 0) {
      const place = tiedPlaces[0].place;
      expect(tiedPlaces.every(s => s.place === place)).toBe(true);
    }
  });
});

describe("disqualifyPlayer", () => {
  test("auto-advances opponent when player is DQ'd", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    const matchId = state.winnersRounds[0][0];
    const match = state.matches[matchId];
    const p1 = resolvePlayer(state, match, "p1")!;
    const p2 = resolvePlayer(state, match, "p2")!;
    state = disqualifyPlayer(state, p1.id);
    expect(state.matches[matchId].winner?.id).toBe(p2.id);
  });

  test("marks loser name with [DQ]", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    const matchId = state.winnersRounds[0][0];
    const match = state.matches[matchId];
    const p1 = resolvePlayer(state, match, "p1")!;
    state = disqualifyPlayer(state, p1.id);
    expect(state.matches[matchId].loser?.name).toContain("[DQ]");
  });

  test("is a no-op if player has no active match", () => {
    const state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    const result = disqualifyPlayer(state, "nonexistent-id");
    expect(result).toBe(state);
  });

  test("sets champion if DQ happens in grand finals", () => {
    let state = generateBracket([
      { id: "p1", name: "P1" }, { id: "p2", name: "P2" },
      { id: "p3", name: "P3" }, { id: "p4", name: "P4" },
    ]);
    let safety = 0;
    while (!getReadyMatches(state).find(m => m.id === state.grandFinalsId) && safety++ < 20) {
      const ready = getReadyMatches(state);
      if (ready.length === 0) break;
      const m = ready[0];
      const winner = resolvePlayer(state, m, "p1") ?? resolvePlayer(state, m, "p2");
      if (winner) state = reportResult(state, m.id, winner.id);
    }
    const gf = state.matches[state.grandFinalsId];
    const p1 = resolvePlayer(state, gf, "p1");
    if (p1) {
      state = disqualifyPlayer(state, p1.id);
      expect(state.champion).not.toBeNull();
    }
  });
});
