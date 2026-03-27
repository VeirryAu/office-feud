import {
  mergeState,
  defaultState,
  round1Set,
  R1_MAX_STRIKES,
} from './state.js';
import { loadState, subscribeStorage } from './storage.js';
import {
  AUDIO,
  playSound,
  startThemeLoop,
  stopTheme,
  playTick,
} from './audio.js';

let state = mergeState(loadState());
let lastPhase = null;
let lastStrikeNonce = 0;
let lastR1RevealKey = '';
let lastR2RevealKey = '';
let prevR1Timer = null;

function $(id) {
  return document.getElementById(id);
}

function showOnly(...ids) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('hidden', !ids.includes(el.id));
  });
}

function sortedTeams() {
  return [...state.teams]
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => b.score - a.score);
}

function flashStrike() {
  const ov = $('strike-overlay');
  ov.classList.add('show');
  ov.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  }, 900);
}

function r1RevealKey() {
  const set = round1Set(state);
  if (!set) return '';
  return state.round1.revealed.join(',');
}

function r2RevealKey() {
  const n = state.questions?.round2?.answers?.length ?? 0;
  return state.round2.revealed.slice(0, n).join(',');
}

function countTrue(key) {
  return key.split(',').filter((x) => x === 'true').length;
}

function handleAudioSideEffects(prev) {
  if (state.phase !== lastPhase) {
    if (state.phase === 'setup' || state.phase === 'leaderboard') {
      startThemeLoop();
    } else {
      stopTheme();
    }
    lastPhase = state.phase;
  }

  if (state.strikeNonce > lastStrikeNonce) {
    lastStrikeNonce = state.strikeNonce;
    flashStrike();
    playSound(AUDIO.buzzer, { volume: 0.75 });
  }

  const rk1 = r1RevealKey();
  if (state.phase === 'round1' && rk1 !== lastR1RevealKey) {
    if (lastR1RevealKey !== '' && countTrue(rk1) > countTrue(lastR1RevealKey)) {
      playSound(AUDIO.ding, { volume: 0.55 });
    }
    lastR1RevealKey = rk1;
  } else if (state.phase !== 'round1') {
    lastR1RevealKey = '';
  }

  const rk2 = r2RevealKey();
  if (state.phase === 'round2' && rk2 !== lastR2RevealKey) {
    if (lastR2RevealKey !== '' && countTrue(rk2) > countTrue(lastR2RevealKey)) {
      playSound(AUDIO.ding, { volume: 0.55 });
    }
    lastR2RevealKey = rk2;
  } else if (state.phase !== 'round2') {
    lastR2RevealKey = '';
  }

  if (state.phase === 'round1' && state.round1.timerRunning) {
    const tr = state.round1.timerRemaining;
    if (
      prevR1Timer !== null &&
      tr < prevR1Timer &&
      tr <= 10 &&
      tr >= 0
    ) {
      playTick();
    }
    prevR1Timer = tr;
  } else {
    prevR1Timer = null;
  }
}

function renderLeaderboardList(ol, short = false) {
  if (!ol) return;
  const rows = sortedTeams();
  ol.innerHTML = rows
    .map(
      (t, rank) =>
        `<li><span class="lb-rank">${rank + 1}</span><span class="lb-name">${t.label}</span><span class="lb-pts">${t.score}</span>${short ? '' : `<span class="lb-members">${t.members.join(' · ')}</span>`}</li>`
    )
    .join('');
}

function renderRound1Board() {
  const set = round1Set(state);
  const grid = $('pub-r1-grid');
  const t = state.teams[state.round1.activeTeamIndex];
  $('pub-r1-team').textContent = t ? `${t.label}` : '';
  $('pub-r1-q').textContent = set?.question ?? '';
  const pct = (state.round1.timerRemaining / 100) * 100;
  $('pub-r1-bar').style.width = `${pct}%`;
  $('pub-r1-clock').textContent = String(state.round1.timerRemaining);
  $('pub-r1-clock').classList.toggle('urgent', state.round1.timerRemaining <= 10);

  const strikesEl = $('pub-r1-strikes');
  if (strikesEl) {
    const s = Math.min(R1_MAX_STRIKES, state.round1.strikes ?? 0);
    strikesEl.innerHTML = [1, 2, 3]
      .map(
        (n) =>
          `<span class="strike-dot ${n <= s ? 'on' : ''}">X</span>`
      )
      .join('');
  }

  if (!set || !grid) return;
  grid.innerHTML = set.answers
    .map((a, i) => {
      const rev = Boolean(state.round1.revealed[i]);
      return `<div class="cell ${rev ? 'revealed flip' : ''}">
        <div class="cell-inner">
          <span class="num">${i + 1}</span>
          <span class="txt">${rev ? a.text : '???'}</span>
          <span class="pts">${rev ? a.points : ''}</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderRound2Board() {
  const q = state.questions?.round2;
  const grid = $('pub-r2-grid');
  const [ia, ib] = state.round2.teamIndices;
  const ta = state.teams[ia];
  const tb = state.teams[ib];
  $('pub-r2-q').textContent = q?.question ?? '';
  const sub = state.round2.subPhase;
  let phaseLabel = '';
  if (sub === 'faceoff') phaseLabel = 'Face-off';
  else if (sub === 'play') phaseLabel = `Play — ${(state.round2.controlling === 0 ? ta : tb)?.label}`;
  else if (sub === 'steal') phaseLabel = `Steal — ${(state.round2.controlling === 0 ? tb : ta)?.label}`;
  else if (sub === 'done') phaseLabel = 'Round complete';
  $('pub-r2-phase').textContent = phaseLabel;
  $('pub-r2-meta').textContent =
    ta && tb
      ? `${ta.label} ${ta.score} pts · ${tb.label} ${tb.score} pts · Bank ${state.round2.bank}`
      : '';

  const strikesEl = $('pub-r2-strikes');
  strikesEl.innerHTML = [1, 2, 3]
    .map(
      (n) =>
        `<span class="strike-dot ${n <= state.round2.strikes ? 'on' : ''}">X</span>`
    )
    .join('');

  if (!q || !grid) return;
  grid.innerHTML = q.answers
    .map((a, i) => {
      const rev = state.round2.revealed[i];
      return `<div class="cell ${rev ? 'revealed flip' : ''}">
        <div class="cell-inner">
          <span class="num">${i + 1}</span>
          <span class="txt">${rev ? a.text : '???'}</span>
          <span class="pts">${rev ? a.points : ''}</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderWinner() {
  const rows = sortedTeams();
  const top = rows[0];
  $('pub-winner-name').textContent = top ? top.label : '—';
  $('pub-winner-score').textContent = top ? `${top.score} points` : '';
}

function renderSetupTeams() {
  const grid = $('pub-setup-teams');
  const heading = $('pub-setup-heading');
  const logoWrap = document.querySelector('.setup-logo');
  if (!grid || !heading) return;

  const teams = state.teams;
  const ready = Array.isArray(teams) && teams.length === 6;

  heading.classList.toggle('hidden', !ready);
  grid.classList.toggle('hidden', !ready);
  if (logoWrap) {
    logoWrap.classList.toggle('compact', ready);
  }

  if (!ready) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = teams
    .map(
      (t) =>
        `<article class="setup-team-card">
          <h2 class="setup-team-name">${t.label}</h2>
          <ul class="setup-team-list">${t.members.map((m) => `<li>${m}</li>`).join('')}</ul>
        </article>`
    )
    .join('');
}

function render() {
  const p = state.phase;
  if (p === 'setup') {
    showOnly('view-setup');
    renderSetupTeams();
  } else if (p === 'round1') {
    showOnly('view-round1');
    renderLeaderboardList($('pub-lb-r1'), true);
    renderRound1Board();
  } else if (p === 'leaderboard') {
    showOnly('view-lb');
    renderLeaderboardList($('pub-lb-full'), false);
  } else if (p === 'round2') {
    showOnly('view-round2');
    renderLeaderboardList($('pub-lb-r2'), true);
    renderRound2Board();
  } else if (p === 'winner') {
    showOnly('view-win');
    renderWinner();
  } else {
    showOnly('view-setup');
    renderSetupTeams();
  }
}

function applyRemote(next) {
  const prev = state;
  state = mergeState(next);
  handleAudioSideEffects(prev);
  render();
}

applyRemote(state);
subscribeStorage(applyRemote);

document.body.addEventListener(
  'click',
  () => {
    if (state.phase === 'setup' || state.phase === 'leaderboard') {
      startThemeLoop();
    }
  },
  { once: true }
);
