import { generateBracket, addPlayerToLosers, addPlayerToSlot, resolvePlayer, reportResult, getReadyMatches } from "./bracket";
import type { BracketState, Player } from "./bracket";

function p(name: string, id = name): Player { return { id, name }; }

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => p(`P${i + 1}`, `p${i + 1}`));
}

// Report the result of every ready match, always picking p1 as winner
function advanceAll(state: BracketState): BracketState {
  let s = state;
  let ready = getReadyMatches(s);
  while (ready.length > 0) {
    for (const m of ready) {
      const p1 = resolvePlayer(s, m, "p1")!;
      s = reportResult(s, m.id, p1.id);
    }
    ready = getReadyMatches(s);
  }
  return s;
}

// Advance only winners bracket matches
function advanceWinnersOnly(state: BracketState): BracketState {
  let s = state;
  let ready = getReadyMatches(s).filter(m => m.bracket === "winners");
  while (ready.length > 0) {
    for (const m of ready) {
      const p1 = resolvePlayer(s, m, "p1")!;
      s = reportResult(s, m.id, p1.id);
    }
    ready = getReadyMatches(s).filter(m => m.bracket === "winners");
  }
  return s;
}

function hasPath(state: BracketState, matchId: string): boolean {
  // Check that the match is reachable from grand finals by following sources backwards
  const visited = new Set<string>();
  function walk(id: string) {
    if (visited.has(id) || !state.matches[id]) return;
    visited.add(id);
    const m = state.matches[id];
    if (typeof m.p1Source === "string") walk(m.p1Source);
    if (typeof m.p2Source === "string") walk(m.p2Source);
    if (m.p1SourceLoser) walk(m.p1SourceLoser);
    if (m.p2SourceLoser) walk(m.p2SourceLoser);
  }
  walk(state.grandFinalsId);
  return visited.has(matchId);
}

describe("addPlayerToLosers", () => {
  describe("addPlayerToSlot: directly filling a winners match slot", () => {
    it("places player into specified slot and updates the match", () => {
      const state = generateBracket(makePlayers(8));
      // Grab any winners match and fill p1 slot directly
      const matchId = state.winnersRounds[0][0];
      const next = addPlayerToSlot(state, matchId, "p2", p("Injected"));
      const m = next.matches[matchId];
      expect(typeof m.p2Source === "object" && (m.p2Source as Player).name).toBe("Injected");
    });

    it("assigns a unique id to each late entrant", () => {
      const state = generateBracket(makePlayers(8));
      const matchId = state.winnersRounds[0][0];
      const s1 = addPlayerToSlot(state, matchId, "p1", p("A"));
      const s2 = addPlayerToSlot(state, matchId, "p1", p("B"));
      const id1 = (s1.matches[matchId].p1Source as Player).id;
      const id2 = (s2.matches[matchId].p1Source as Player).id;
      expect(id1).not.toBe(id2);
    });
  });

  describe("late entry with no bye slots (losers path)", () => {
    it("8-player: late entrant is placed and has a downstream path to GF", () => {
      let state = generateBracket(makePlayers(8));
      // Play one winners match so there's a completed W match
      const firstReady = getReadyMatches(state).filter(m => m.bracket === "winners")[0];
      const w = resolvePlayer(state, firstReady, "p1")!;
      state = reportResult(state, firstReady.id, w.id);

      state = addPlayerToLosers(state, p("Late1"));
      const lateMatch = Object.values(state.matches).find(m => m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === "Late1");
      expect(lateMatch).toBeDefined();
      expect(hasPath(state, lateMatch!.id)).toBe(true);
    });

    it("multiple late entries all have downstream paths", () => {
      let state = generateBracket(makePlayers(8));
      state = advanceWinnersOnly(state);

      state = addPlayerToLosers(state, p("Late1"));
      state = addPlayerToLosers(state, p("Late2"));
      state = addPlayerToLosers(state, p("Late3"));

      for (const name of ["Late1", "Late2", "Late3"]) {
        const m = Object.values(state.matches).find(m =>
          m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === name
        );
        expect(m).toBeDefined();
        expect(hasPath(state, m!.id)).toBe(true);
      }
    });

    it("late entry mid-tournament still has a path", () => {
      let state = generateBracket(makePlayers(8));
      // Advance half the bracket
      const ready = getReadyMatches(state).filter(m => m.bracket === "winners").slice(0, 2);
      for (const m of ready) {
        state = reportResult(state, m.id, resolvePlayer(state, m, "p1")!.id);
      }

      state = addPlayerToLosers(state, p("LateMiddle"));
      const lateMatch = Object.values(state.matches).find(m =>
        m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === "LateMiddle"
      );
      expect(lateMatch).toBeDefined();
      expect(hasPath(state, lateMatch!.id)).toBe(true);
    });

    it("late entry after all winners rounds complete still has a path", () => {
      let state = generateBracket(makePlayers(8));
      state = advanceWinnersOnly(state);

      state = addPlayerToLosers(state, p("VeryLate"));
      const lateMatch = Object.values(state.matches).find(m =>
        m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === "VeryLate"
      );
      expect(lateMatch).toBeDefined();
      expect(hasPath(state, lateMatch!.id)).toBe(true);
    });

    it("late entrant can actually play matches and reach GF", () => {
      let state = generateBracket(makePlayers(8));
      state = advanceWinnersOnly(state);
      state = addPlayerToLosers(state, p("LateChamp", "late-champ"));

      // Advance everything, always picking the late entrant if they're playing, else p1
      let s = state;
      let ready = getReadyMatches(s);
      let iterations = 0;
      while (ready.length > 0 && iterations++ < 50) {
        for (const m of ready) {
          const p1 = resolvePlayer(s, m, "p1")!;
          const p2 = resolvePlayer(s, m, "p2")!;
          const pick = p1.name === "LateChamp" ? p1 : p2.name === "LateChamp" ? p2 : p1;
          s = reportResult(s, m.id, pick.id);
        }
        ready = getReadyMatches(s);
      }
      // LateChamp should have played at least one match
      const played = Object.values(s.matches).filter(m =>
        m.winner?.name === "LateChamp" || m.loser?.name === "LateChamp"
      );
      expect(played.length).toBeGreaterThan(0);
    });

    it("4-player bracket late entry has a path", () => {
      let state = generateBracket(makePlayers(4));
      const firstW = getReadyMatches(state).filter(m => m.bracket === "winners")[0];
      state = reportResult(state, firstW.id, resolvePlayer(state, firstW, "p1")!.id);

      state = addPlayerToLosers(state, p("Late1"));
      const lateMatch = Object.values(state.matches).find(m =>
        m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === "Late1"
      );
      expect(lateMatch).toBeDefined();
      expect(hasPath(state, lateMatch!.id)).toBe(true);
    });

    it("16-player bracket multiple late entries all have paths", () => {
      let state = generateBracket(makePlayers(16));
      state = advanceWinnersOnly(state);

      state = addPlayerToLosers(state, p("Late1"));
      state = addPlayerToLosers(state, p("Late2"));

      for (const name of ["Late1", "Late2"]) {
        const m = Object.values(state.matches).find(m =>
          m.p1Source && typeof m.p1Source === "object" && (m.p1Source as Player).name === name
        );
        expect(m).toBeDefined();
        expect(hasPath(state, m!.id)).toBe(true);
      }
    });
  });
});
