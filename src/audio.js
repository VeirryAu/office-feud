const BASE =
  'audio';

export const AUDIO = {
  theme: `${BASE}/title.mp3`,
  ding: `${BASE}/good-answer.mp3`,
  buzzer: `${BASE}/buzzer.wav`,
};

let themeAudio = null;

export function playSound (url, { loop = false, volume = 1 } = {}) {
  const a = new Audio(url);
  a.volume = volume;
  a.loop = loop;
  return a.play().then(() => a).catch(() => null);
}

export function stopTheme () {
  if (themeAudio) {
    themeAudio.pause();
    themeAudio.currentTime = 0;
    themeAudio = null;
  }
}

export async function startThemeLoop () {
  stopTheme();
  themeAudio = new Audio(AUDIO.theme);
  themeAudio.loop = true;
  themeAudio.volume = 0.35;
  try {
    await themeAudio.play();
  } catch {
    themeAudio = null;
  }
}

export function playTick () {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.frequency.value = 880;
  o.type = 'sine';
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
  o.start(ctx.currentTime);
  o.stop(ctx.currentTime + 0.08);
}
