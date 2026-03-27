import {
  mergeState,
  defaultState,
  parseParticipants,
  buildTeams,
  PARTICIPANT_COUNT,
  validateQuestions,
  round1Set,
  round1RevealedPoints,
  round1AllRevealed,
  topTwoTeamIndices,
  R1_DURATION,
  R1_TIME_BONUS_MAX,
  R1_MAX_STRIKES,
  defaultRound1,
  defaultRound2,
} from './state.js';
import { loadState, saveState } from './storage.js';

let state = mergeState(loadState());
let timerId = null;

const $ = (id) => document.getElementById(id);

function persist () {
  saveState(state);
}

function stopR1Timer () {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  state.round1.timerRunning = false;
}

function tickR1 () {
  if (!state.round1.timerRunning) return;
  if (state.round1.timerRemaining <= 0) {
    stopR1Timer();
    persist();
    render();
    return;
  }
  state.round1.timerRemaining -= 1;
  if (state.round1.timerRemaining <= 0) {
    stopR1Timer();
  }
  persist();
  render();
}

function startR1Timer () {
  if (timerId) return;
  state.round1.timerRunning = true;
  timerId = setInterval(tickR1, 1000);
  persist();
  render();
}

function showPanels () {
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  const map = {
    setup: $('panel-setup'),
    round1: $('panel-round1'),
    leaderboard: $('panel-leaderboard'),
    round2: $('panel-round2'),
    winner: $('panel-winner'),
  };
  map[state.phase]?.classList.remove('hidden');
  document.querySelectorAll('.phases button').forEach((b) => {
    b.classList.toggle('active', b.dataset.phase === state.phase);
  });
}

function render () {
  showPanels();
  renderSetupStatus();
  renderRound1();
  renderLeaderboard();
  renderRound2();
}

function renderSetupStatus () {
  const ps = $('participantStatus');
  const qs = $('questionStatus');
  const roster = $('setupTeamRoster');
  if (state.participants.length) {
    ps.textContent = `${state.participants.length} participants · ${state.teams.length} teams ready`;
  } else {
    ps.textContent = '';
  }
  if (state.questions) {
    qs.textContent = 'Questions loaded.';
  } else {
    qs.textContent = '';
  }
  if (roster) {
    const show = state.teams.length === 6;
    roster.classList.toggle('hidden', !show);
    if (show) {
      roster.innerHTML =
        '<h3 class="setup-roster-title">Teams (same order as public screen)</h3>' +
        state.teams
          .map(
            (t) =>
              `<div class="setup-roster-team"><strong>${t.label}</strong><span class="setup-roster-members">${t.members.join(' · ')}</span></div>`
          )
          .join('');
    } else {
      roster.innerHTML = '';
    }
  }
  if ($('participantsInput') && !$('participantsInput').matches(':focus')) {
    $('participantsInput').value = state.participants.length
      ? state.participants.join(', ')
      : '';
  }
}

function renderRound1 () {
  const set = round1Set(state);
  if (set && state.round1.revealed.length !== set.answers.length) {
    state.round1.revealed = set.answers.map(
      (_, i) => Boolean(state.round1.revealed[i])
    );
    persist();
  }
  const elTeam = $('r1-team-info');
  const elQ = $('r1-question');
  const elTimer = $('r1-timer-display');
  const elPrev = $('r1-scores-preview');
  const list = $('r1-answers');
  if (!elTeam || state.phase !== 'round1') return;

  if (!state.questions || !set) {
    elTeam.textContent = 'Load questions first.';
    return;
  }

  const t = state.teams[state.round1.activeTeamIndex];
  elTeam.textContent = `${t?.label ?? 'Team'} · Members: ${(t?.members ?? []).join(', ')}`;
  elQ.textContent = set.question;
  elTimer.textContent = String(state.round1.timerRemaining);
  const base = round1RevealedPoints(state);
  const bonus =
    !state.round1.gaveUp &&
      round1AllRevealed(state) &&
      state.round1.timerRemaining > 0
      ? Math.min(R1_TIME_BONUS_MAX, state.round1.timerRemaining)
      : 0;
  elPrev.textContent = `Running total: ${base} pts${bonus ? ` + time bonus up to ${bonus}` : ''}`;

  const giveUpOk =
    state.round1.timerRemaining <= R1_DURATION / 2 &&
    state.round1.revealed.some(Boolean) &&
    !state.round1.gaveUp;
  $('r1-giveup').disabled = !giveUpOk;

  const strikes = Math.min(R1_MAX_STRIKES, state.round1.strikes ?? 0);
  $('r1-strikes').textContent = String(strikes);
  const r1StrikeBtn = $('r1-strike');
  if (r1StrikeBtn) {
    r1StrikeBtn.disabled =
      state.round1.gaveUp || strikes >= R1_MAX_STRIKES;
  }

  list.innerHTML = '';
  set.answers.forEach((a, i) => {
    const li = document.createElement('li');
    const revealed = state.round1.revealed[i];
    li.innerHTML = `<button type="button" class="toggle ${revealed ? 'on' : ''}" data-i="${i}">
      <span class="ans-line">${a.text} — ${a.points}</span>
      <span class="proj-hint">${revealed ? 'On projector (click to hide)' : 'Off projector (click to reveal)'}</span>
    </button>`;
    list.appendChild(li);
  });
  list.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.i);
      state.round1.revealed[i] = !state.round1.revealed[i];
      if (round1AllRevealed(state)) {
        stopR1Timer();
      }
      persist();
      render();
    };
  });
}

function renderLeaderboard () {
  const ul = $('admin-leaderboard');
  const ov = $('score-overrides');
  if (!ul || state.phase !== 'leaderboard') return;
  const sorted = [...state.teams]
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => b.score - a.score);
  ul.innerHTML = sorted
    .map(
      (t) =>
        `<li><strong>${t.label}</strong> — ${t.score} pts · ${t.members.join(', ')}</li>`
    )
    .join('');
  ov.innerHTML = state.teams
    .map(
      (t, i) => `<label class="inline">${t.label} <input type="number" data-team="${i}" value="${t.score}" /></label>`
    )
    .join(' ');
  ov.querySelectorAll('input[data-team]').forEach((inp) => {
    inp.onchange = () => {
      const i = Number(inp.dataset.team);
      state.teams[i].score = Number(inp.value) || 0;
      persist();
      render();
    };
  });
}

function renderRound2 () {
  if (state.phase !== 'round2') return;
  const q = state.questions?.round2;
  const elM = $('r2-matchup');
  const elQ = $('r2-question');
  const [ia, ib] = state.round2.teamIndices;
  const ta = state.teams[ia];
  const tb = state.teams[ib];
  if (!q || !ta || !tb) {
    elM.textContent = 'Load questions and complete Round 1 first.';
    return;
  }
  elM.textContent = `${ta.label} vs ${tb.label}`;
  elQ.textContent = q.question;

  $('r2-face-a').textContent = `${ta.label} won face-off`;
  $('r2-face-b').textContent = `${tb.label} won face-off`;

  const n = q.answers.length;
  while (state.round2.revealed.length < n) state.round2.revealed.push(false);
  state.round2.revealed = state.round2.revealed.slice(0, n);

  const sub = state.round2.subPhase;
  $('r2-faceoff').classList.toggle('hidden', sub !== 'faceoff');
  $('r2-play').classList.toggle('hidden', sub !== 'play' && sub !== 'steal');
  $('r2-steal').classList.toggle('hidden', sub !== 'steal');
  $('r2-done').classList.toggle('hidden', sub !== 'done');

  if (sub === 'play' || sub === 'steal') {
    const ctrl = state.round2.controlling;
    const ctrlTeam = ctrl === 0 ? ta : tb;
    $('r2-control').textContent =
      sub === 'steal'
        ? `Steal: ${ctrl === 0 ? tb.label : ta.label} may guess once.`
        : `Board control: ${ctrlTeam.label}`;
    $('r2-bank').textContent = String(state.round2.bank);
    $('r2-strikes').textContent = String(state.round2.strikes);
    $('r2-strike').disabled = sub !== 'play';
  }

  const listFace = $('r2-face-answers');
  const listPlay = $('r2-answers');

  function bindR2Answers (list, mode) {
    if (!list) return;
    list.innerHTML = '';
    q.answers.forEach((a, i) => {
      const li = document.createElement('li');
      const revealed = state.round2.revealed[i];
      const canToggle =
        !revealed &&
        (mode === 'faceoff' || (mode === 'board' && sub === 'play'));
      li.innerHTML = `<button type="button" class="toggle ${revealed ? 'on' : ''}" data-i="${i}" ${canToggle ? '' : 'disabled'}>
      <span class="ans-line">${a.text} — ${a.points}</span>
      <span class="proj-hint">${revealed ? 'On projector' : 'Off projector'}${canToggle ? ' (click to reveal)' : ''}</span>
    </button>`;
      list.appendChild(li);
    });
    list.querySelectorAll('button[data-i]:not([disabled])').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        if (state.round2.revealed[i]) return;
        state.round2.revealed[i] = true;
        if (mode === 'board' && sub === 'play') {
          state.round2.bank += q.answers[i].points;
        }
        persist();
        render();
      };
    });
  }

  if (sub === 'faceoff') {
    bindR2Answers(listFace, 'faceoff');
    if (listPlay) listPlay.innerHTML = '';
  } else if (sub === 'play' || sub === 'steal') {
    if (listFace) listFace.innerHTML = '';
    bindR2Answers(listPlay, 'board');
  } else {
    if (listFace) listFace.innerHTML = '';
    if (listPlay) listPlay.innerHTML = '';
  }
}

function initRound2State () {
  const n = state.questions?.round2?.answers?.length ?? 4;
  state.round2 = {
    ...defaultRound2(),
    teamIndices: topTwoTeamIndices(state.teams),
    revealed: Array(n).fill(false),
  };
}

function finalizeR1Turn () {
  const ti = state.round1.activeTeamIndex;
  const base = round1RevealedPoints(state);
  const bonus =
    !state.round1.gaveUp &&
      round1AllRevealed(state) &&
      state.round1.timerRemaining > 0
      ? Math.min(R1_TIME_BONUS_MAX, state.round1.timerRemaining)
      : 0;
  const add = base + bonus;
  state.teams = state.teams.map((t, i) =>
    i === ti ? { ...t, score: t.score + add } : t
  );
  const completed = [...state.round1.completedTeams];
  completed[ti] = true;
  stopR1Timer();
  if (ti < 5) {
    const nextSet = state.questions.round1[ti + 1];
    const n = nextSet.answers.length;
    state.round1 = {
      ...defaultRound1(),
      activeTeamIndex: ti + 1,
      completedTeams: completed,
      revealed: Array(n).fill(false),
    };
  } else {
    state.round1 = {
      ...state.round1,
      completedTeams: completed,
      timerRunning: false,
    };
  }
  persist();
  render();
}

document.querySelectorAll('[data-phase]').forEach((btn) => {
  btn.onclick = () => {
    const phase = btn.dataset.phase;
    if (phase === 'round1' && (!state.questions || state.teams.length !== 6)) {
      alert(`Need 6 teams and questions JSON first. ${state.teams.length} teams found.`);
      return;
    }
    if (phase === 'round2') {
      if (!state.questions?.round2) {
        alert('Need questions.');
        return;
      }
      initRound2State();
    }
    state.phase = phase;
    persist();
    render();
  };
});

$('saveParticipants').onclick = () => {
  const raw = $('participantsInput').value;
  const names = parseParticipants(raw);
  if (names.length !== PARTICIPANT_COUNT) {
    $('participantStatus').textContent = `Expected ${PARTICIPANT_COUNT} names, got ${names.length}.`;
    return;
  }
  state.participants = names;
  state.teams = buildTeams(names);
  persist();
  render();
};

$('loadExampleParticipants').onclick = async () => {
  try {
    const r = await fetch('/example/participant.csv');
    const text = await r.text();
    $('participantsInput').value = text.trim();
  } catch {
    $('participantStatus').textContent = 'Could not load example (use dev server). Paste CSV manually.';
  }
};

$('questionsFile').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const data = JSON.parse(text);
    const err = validateQuestions(data);
    if (err) {
      $('questionStatus').textContent = err;
      return;
    }
    state.questions = data;
    $('questionStatus').textContent = 'OK — Round 1 (6×100) and Round 2 validated.';
    persist();
    render();
  } catch {
    $('questionStatus').textContent = 'Invalid JSON.';
  }
};

$('resetAll').onclick = () => {
  if (!confirm('Clear all saved game state?')) return;
  stopR1Timer();
  state = defaultState();
  persist();
  render();
};

$('r1-start').onclick = () => {
  if (state.round1.gaveUp) return;
  startR1Timer();
};

$('r1-pause').onclick = () => {
  stopR1Timer();
  persist();
  render();
};

$('r1-reset').onclick = () => {
  stopR1Timer();
  state.round1.timerRemaining = R1_DURATION;
  persist();
  render();
};

$('r1-giveup').onclick = () => {
  stopR1Timer();
  state.round1.gaveUp = true;
  persist();
  render();
};

$('r1-strike').onclick = () => {
  if (state.round1.gaveUp) return;
  if ((state.round1.strikes ?? 0) >= R1_MAX_STRIKES) return;
  state.round1.strikes = (state.round1.strikes ?? 0) + 1;
  state.strikeNonce += 1;
  persist();
  render();
};

$('r1-finalize').onclick = () => finalizeR1Turn();

$('r2-face-a').onclick = () => {
  state.round2.faceoffWinner = 0;
  state.round2.controlling = 0;
  state.round2.subPhase = 'play';
  persist();
  render();
};

$('r2-face-b').onclick = () => {
  state.round2.faceoffWinner = 1;
  state.round2.controlling = 1;
  state.round2.subPhase = 'play';
  persist();
  render();
};

$('r2-strike').onclick = () => {
  if (state.round2.subPhase !== 'play') return;
  state.round2.strikes += 1;
  state.strikeNonce += 1;
  if (state.round2.strikes >= 3) {
    state.round2.subPhase = 'steal';
  }
  persist();
  render();
};

function applyBankToTeam (teamIndex) {
  const add = state.round2.bank;
  if (add <= 0) return;
  state.teams = state.teams.map((t, i) =>
    i === teamIndex ? { ...t, score: t.score + add } : t
  );
  state.round2.bank = 0;
}

$('r2-steal-yes').onclick = () => {
  const [ia, ib] = state.round2.teamIndices;
  const ctrl = state.round2.controlling;
  const opposingIdx = ctrl === 0 ? ib : ia;
  applyBankToTeam(opposingIdx);
  state.round2.subPhase = 'done';
  state.round2.stealOutcome = 'stole';
  persist();
  render();
};

$('r2-steal-no').onclick = () => {
  const [ia, ib] = state.round2.teamIndices;
  const ctrl = state.round2.controlling;
  const keeperIdx = ctrl === 0 ? ia : ib;
  applyBankToTeam(keeperIdx);
  state.round2.subPhase = 'done';
  state.round2.stealOutcome = 'defended';
  persist();
  render();
};

window.addEventListener('beforeunload', () => stopR1Timer());

render();
