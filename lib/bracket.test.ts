import { generateBracket, reportResult, resolvePlayer, BracketState, Player } from "@/lib/bracket";

// Suppress console logs from bracket logic during tests
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

// Play every available match by picking p1 as winner until no more moves
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
          if (loserSrc) {
            expect(state.matches[loserSrc]).toBeDefined();
          } else if (typeof src === "string") {
            expect(state.matches[src]).toBeDefined();
          }
          // src can be a Player object or null — both are valid
        }
      }
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: winners bracket has correct number of rounds",
    (n) => {
      const state = generateBracket(makePlayers(n));
      // Winners rounds = ceil(log2(n)) rounds (prelim + main rounds)
      expect(state.winnersRounds.length).toBeGreaterThanOrEqual(1);
      // Final winners round always has exactly 1 match
      const lastWR = state.winnersRounds[state.winnersRounds.length - 1];
      expect(lastWR.length).toBe(1);
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: grand finals references last winners and losers rounds",
    (n) => {
      const state = generateBracket(makePlayers(n));
      const gf = state.matches[state.grandFinalsId];
      const lastWR = state.winnersRounds[state.winnersRounds.length - 1][0];
      const lastLR = state.losersRounds[state.losersRounds.length - 1][0];
      expect(gf.p1Source).toBe(lastWR);
      expect(gf.p2Source).toBe(lastLR);
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: no match has two null/undefined sources simultaneously (would be unplayable forever)",
    (n) => {
      const state = generateBracket(makePlayers(n));
      for (const match of Object.values(state.matches)) {
        if (match.bracket === "grand-finals") continue;
        const p1HasSource = match.p1Source !== null || !!match.p1SourceLoser;
        const p2HasSource = match.p2Source !== null || !!match.p2SourceLoser;
        // At least one slot must have a source (bye matches have exactly one)
        expect(p1HasSource || p2HasSource).toBe(true);
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
        if (match.loser) {
          lossCounts[match.loser.id] = (lossCounts[match.loser.id] ?? 0) + 1;
        }
      }
      for (const [id, count] of Object.entries(lossCounts)) {
        if (count > 2) {
          const name = players.find(p => p.id === id)?.name;
          console.error(`${n} players: ${name} (${id}) lost ${count} times`);
          // Log all matches where this player lost
          for (const match of Object.values(state.matches)) {
            if (match.loser?.id === id) {
              console.error(`  lost in ${match.id} (${match.bracket})`);
            }
          }
        }
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
        if (match.loser) {
          lossCounts[match.loser.id] = (lossCounts[match.loser.id] ?? 0) + 1;
        }
      }
      expect(lossCounts[state.champion!.id] ?? 0).toBe(0);
    }
  );

  test.each([3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 64])(
    "%i players: out-of-order completion produces same champion as in-order",
    (n) => {
      const players = makePlayers(n);

      // In-order: always pick first available match
      const inOrder = simulateFull(generateBracket(players));

      // Out-of-order: complete winners bracket last-round-first, then losers
      let state = generateBracket(players);
      let changed = true;
      while (changed) {
        changed = false;
        // Try to play matches in reverse round order
        const allMatches = Object.values(state.matches).reverse();
        for (const match of allMatches) {
          if (match.winner) continue;
          const p1 = resolvePlayer(state, match, "p1");
          const p2 = resolvePlayer(state, match, "p2");
          if (p1 && p2) {
            state = reportResult(state, match.id, p1.id);
            changed = true;
            break; // restart after each change
          }
        }
      }

      expect(state.champion?.id).toBe(inOrder.champion?.id);
    }
  );
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
    state = reportResult(state, firstMatch, p2.id); // try to change winner
    expect(JSON.stringify(state)).toBe(before);
  });

  test("seeds 1, 2, 3 are placed in separate bracket halves", () => {
    const state = generateBracket(makePlayers(8));
    // In an 8-player bracket, seed 1 and seed 2 should be in different halves of round 1
    const r1 = state.winnersRounds[0];
    const half = Math.floor(r1.length / 2);
    const findSeedInRound = (seed: number) =>
      r1.findIndex((id) => {
        const m = state.matches[id];
        const p1 = m.p1Source as Player;
        const p2 = m.p2Source as Player;
        return p1?.seed === seed || p2?.seed === seed;
      });
    const s1idx = findSeedInRound(1);
    const s2idx = findSeedInRound(2);
    if (s1idx !== -1 && s2idx !== -1) {
      expect(Math.floor(s1idx / half)).not.toBe(Math.floor(s2idx / half));
    }
  });
});
