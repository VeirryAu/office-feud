export const R1_DURATION = 60;
/** Max points from remaining seconds when the board is cleared (Round 1). */
export const R1_TIME_BONUS_MAX = 30;
export const R1_MAX_STRIKES = 3;
export const PARTICIPANT_COUNT = 42;
export const TEAM_COUNT = 6;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function parseParticipants(text) {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildTeams(names) {
  const shuffled = shuffle(names);
  const teams = [];
  for (let t = 0; t < TEAM_COUNT; t++) {
    const members = shuffled.slice(t * 7, (t + 1) * 7);
    teams.push({
      id: t,
      label: `Team ${t + 1}`,
      members,
      score: 0,
    });
  }
  return teams;
}

export function defaultRound1() {
  return {
    activeTeamIndex: 0,
    revealed: [false, false, false, false],
    timerRemaining: R1_DURATION,
    timerRunning: false,
    completedTeams: [false, false, false, false, false, false],
    gaveUp: false,
    strikes: 0,
  };
}

export function defaultRound2() {
  return {
    teamIndices: [0, 1],
    faceoffWinner: null,
    controlling: null,
    strikes: 0,
    bank: 0,
    revealed: [false, false, false, false],
    subPhase: 'faceoff',
    stealOutcome: null,
  };
}

export function defaultState() {
  return {
    v: 1,
    participants: [],
    teams: [],
    questions: null,
    phase: 'setup',
    round1: defaultRound1(),
    round2: defaultRound2(),
    strikeNonce: 0,
    lastTickSecond: null,
  };
}

export function mergeState(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== 'object') return base;
  const r1 = { ...defaultRound1(), ...saved.round1 };
  if (!Array.isArray(r1.revealed)) r1.revealed = [...defaultRound1().revealed];
  if (typeof r1.strikes !== 'number' || r1.strikes < 0) r1.strikes = 0;
  const r2 = { ...defaultRound2(), ...saved.round2 };
  if (!Array.isArray(r2.revealed)) r2.revealed = [...defaultRound2().revealed];
  return {
    ...base,
    ...saved,
    teams: Array.isArray(saved.teams) ? saved.teams : base.teams,
    round1: r1,
    round2: r2,
    questions: saved.questions ?? null,
    strikeNonce: typeof saved.strikeNonce === 'number' ? saved.strikeNonce : 0,
  };
}

export function round1Set(state) {
  const q = state.questions?.round1;
  if (!q) return null;
  const idx = state.round1.activeTeamIndex;
  return q[idx] ?? null;
}

export function round1RevealedPoints(state) {
  const set = round1Set(state);
  if (!set) return 0;
  return set.answers.reduce(
    (sum, a, i) => sum + (state.round1.revealed[i] ? a.points : 0),
    0
  );
}

export function round1AllRevealed(state) {
  const set = round1Set(state);
  if (!set) return false;
  return set.answers.every((_, i) => state.round1.revealed[i]);
}

export function round1TimeBonus(state) {
  if (!round1AllRevealed(state)) return 0;
  return Math.min(R1_TIME_BONUS_MAX, state.round1.timerRemaining);
}

export function topTwoTeamIndices(teams) {
  const ranked = teams
    .map((t, i) => ({ i, score: t.score }))
    .sort((a, b) => b.score - a.score);
  return [ranked[0].i, ranked[1].i];
}

export function validateQuestions(data) {
  if (!data?.round1 || !Array.isArray(data.round1) || data.round1.length !== 6)
    return 'round1 must be an array of 6 question sets';
  for (let s = 0; s < 6; s++) {
    const set = data.round1[s];
    const total = set.answers?.reduce((acc, a) => acc + (a.points || 0), 0);
    if (total !== 100)
      return `Round 1 set ${s + 1} answers must sum to 100 points (got ${total})`;
  }
  const r2 = data.round2;
  if (!r2?.answers) return 'round2 must have answers';
  const t2 = r2.answers.reduce((acc, a) => acc + (a.points || 0), 0);
  if (t2 !== 100) return `Round 2 answers must sum to 100 points (got ${t2})`;
  return null;
}
