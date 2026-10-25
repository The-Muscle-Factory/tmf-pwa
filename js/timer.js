// Rest timer: a floating bar that counts down. Uses an end timestamp so it stays
// correct if the app is backgrounded.
import { h } from './dom.js';

let endAt = 0;
let tick = null;
let audio = null;
let host = null;

export function mountTimer(el) {
  host = el;
  render();
}

export function startTimer(seconds) {
  // Creating/resuming the AudioContext inside the tap gesture unlocks sound on iOS.
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch {}
  endAt = Date.now() + seconds * 1000;
  clearInterval(tick);
  tick = setInterval(render, 250);
  render();
}

function adjust(delta) {
  endAt = Math.max(Date.now(), endAt + delta * 1000);
  render();
}

function stop() {
  endAt = 0;
  clearInterval(tick);
  render();
}

function beep() {
  if (!audio) return;
  [0, 0.25, 0.5].forEach((offset) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audio.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.2);
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + offset);
    osc.stop(audio.currentTime + offset + 0.2);
  });
  navigator.vibrate?.([200, 100, 200]);
}

function render() {
  if (!host) return;
  host.replaceChildren();
  if (!endAt) {
    host.hidden = true;
    return;
  }
  const left = Math.ceil((endAt - Date.now()) / 1000);
  if (left <= 0) {
    beep();
    stop();
    return;
  }
  host.hidden = false;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  host.append(
    h('span', { class: 'timer-label' }, 'Rest'),
    h('span', { class: 'timer-time' }, `${m}:${s}`),
    h('button', { class: 'timer-btn', onclick: () => adjust(-15) }, '−15'),
    h('button', { class: 'timer-btn', onclick: () => adjust(15) }, '+15'),
    h('button', { class: 'timer-btn stop', onclick: stop }, 'Skip')
  );
}
