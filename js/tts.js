// Vorlesen mit den Stimmen des Geräts (kostenlos, ohne Limit).
import { state } from './store.js';

const synth = window.speechSynthesis;

export function ttsSupported() {
  return !!synth;
}

export function getVoices() {
  return new Promise(resolve => {
    if (!synth) return resolve([]);
    const v = synth.getVoices();
    if (v.length) return resolve(v);
    const t = setTimeout(() => resolve(synth.getVoices()), 1500);
    synth.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(synth.getVoices()); }, { once: true });
  });
}

// Natürlich klingende Stimmen nach oben sortieren.
export function voiceScore(v) {
  let s = 0;
  if (/natural|neural|online|premium|enhanced|wavenet/i.test(v.name)) s += 10;
  if (/google/i.test(v.name)) s += 5;
  if (/microsoft/i.test(v.name)) s += 3;
  if (v.localService === false) s += 2;
  return s;
}

export async function voicesFor(lang = 'de') {
  const all = await getVoices();
  return all
    .filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

async function pickVoice(lang = 'de', uri = state.settings.voiceURI) {
  const list = await voicesFor(lang);
  if (lang === 'de' && uri) {
    const chosen = list.find(v => v.voiceURI === uri);
    if (chosen) return chosen;
  }
  return list[0] || null;
}

// Lange Texte in Sätze teilen. (Chrome bricht sonst nach ca. 15 Sekunden ab.)
export function splitSentences(text) {
  const clean = String(text)
    .replace(/[*_#`>|]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = clean.match(/[^.!?…]+[.!?…]+["“”»«)]*|[^.!?…]+$/g) || [clean];
  const out = [];
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    while (p.length > 220) {
      let cut = p.lastIndexOf(',', 220);
      if (cut < 80) cut = p.lastIndexOf(' ', 220);
      if (cut < 1) cut = 220;
      out.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1).trim();
    }
    if (p) out.push(p);
  }
  return out;
}

function speakOne(text, { voice, rate, lang }) {
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || (lang === 'de' ? 'de-DE' : lang);
    u.rate = rate;
    u.onend = () => resolve('end');
    u.onerror = () => resolve('error');
    synth.speak(u);
  });
}

// Kurzes Vorlesen (z. B. eine Lernkarte).
export async function speak(text, lang = 'de') {
  if (!synth) return;
  synth.cancel();
  const voice = await pickVoice(lang);
  for (const s of splitSentences(text)) {
    const r = await speakOne(s, { voice, rate: state.settings.rate, lang });
    if (r === 'error') break;
  }
}

export function stopSpeaking() {
  synth?.cancel();
}

/**
 * Audio-Player für Lektionen: Abschnitt für Abschnitt, mit Denk-Pausen dazwischen.
 * sections: [{ heading, text }]
 */
export class AudioPlayer {
  constructor(sections, { onUpdate } = {}) {
    this.sections = sections.map(s => ({ heading: s.heading, sentences: splitSentences(`${s.heading ? s.heading + '. ' : ''}${s.text}`) }));
    this.onUpdate = onUpdate || (() => {});
    this.sec = 0;
    this.sent = 0;
    this.playing = false;
    this.pauseLeft = 0;
    this.runId = 0;
  }

  status() {
    return { sec: this.sec, total: this.sections.length, playing: this.playing, pauseLeft: this.pauseLeft, sentence: this.sections[this.sec]?.sentences[this.sent] || '' };
  }

  async play() {
    if (this.playing) return;
    if (this.sec >= this.sections.length) { this.sec = 0; this.sent = 0; }
    this.playing = true;
    const id = ++this.runId;
    this.onUpdate(this.status());
    const voice = await pickVoice('de');
    while (this.playing && id === this.runId && this.sec < this.sections.length) {
      const section = this.sections[this.sec];
      while (this.sent < section.sentences.length) {
        if (!this.playing || id !== this.runId) return;
        this.onUpdate(this.status());
        const r = await speakOne(section.sentences[this.sent], { voice, rate: state.settings.rate, lang: 'de' });
        if (!this.playing || id !== this.runId) return;
        if (r === 'error') { this.stop(); return; }
        this.sent++;
      }
      this.sec++;
      this.sent = 0;
      if (this.sec < this.sections.length) await this.thinkPause(id);
    }
    if (id === this.runId) {
      this.playing = false;
      this.pauseLeft = 0;
      this.onUpdate({ ...this.status(), finished: this.sec >= this.sections.length });
    }
  }

  // Pause, damit das Wissen "ankommt".
  async thinkPause(id) {
    const min = Number(state.settings.pauseMin) || 0;
    const max = Math.max(min, Number(state.settings.pauseMax) || 0);
    let secs = Math.round(min + Math.random() * (max - min));
    this.skipPause = false;
    while (secs > 0 && this.playing && id === this.runId && !this.skipPause) {
      this.pauseLeft = secs;
      this.onUpdate(this.status());
      await new Promise(r => setTimeout(r, 1000));
      secs--;
    }
    this.pauseLeft = 0;
  }

  pause() {
    this.playing = false;
    this.runId++;
    this.pauseLeft = 0;
    synth.cancel();
    this.onUpdate(this.status());
  }

  stop() {
    this.pause();
  }

  next() {
    if (this.pauseLeft > 0) { this.skipPause = true; return; }
    const was = this.playing;
    this.pause();
    this.sec = Math.min(this.sections.length - 1, this.sec + 1);
    this.sent = 0;
    if (was) this.play(); else this.onUpdate(this.status());
  }

  prev() {
    const was = this.playing;
    this.pause();
    this.sec = this.sent > 0 ? this.sec : Math.max(0, this.sec - 1);
    this.sent = 0;
    if (was) this.play(); else this.onUpdate(this.status());
  }

  goTo(i) {
    this.pause();
    this.sec = i;
    this.sent = 0;
    this.play();
  }
}
