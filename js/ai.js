// KI-Anschluss: Google Gemini (kostenlos mit eigenem Schlüssel) oder Claude (Anthropic).
import { state, save } from './store.js';
import { profileText } from './questions.js';

let anthropicModule = null;

export function aiReady() {
  const s = state.settings;
  return s.provider === 'claude' ? !!s.claudeKey : !!s.geminiKey;
}

export function systemPrompt(extra = '') {
  const a = state.profile.answers || {};
  const name = a.name || 'der Schüler';
  const mem = state.memory.length ? state.memory.map(m => `- ${m.text}`).join('\n') : '- (noch nichts)';
  const activity = activitySummary();
  return `Du bist "LernPilot", ein persönlicher Lern-Coach und Nachhilfelehrer für ${name}.
Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.

SO IST ${name.toUpperCase()} (aus dem Kennenlern-Fragebogen):
${profileText(a) || '- (Fragebogen noch nicht ausgefüllt)'}

DAS HAST DU DIR GEMERKT:
${mem}

LETZTE LERN-AKTIVITÄT:
${activity}

REGELN:
- Richte dich nach dem aktuellen Bildungsplan / Lehrplan von ${a.bundesland || 'Deutschland'} für Klasse ${a.klasse || '10–12'} (${a.schulart || 'Gymnasium'}). Nutze die Begriffe und Methoden, die dort im Unterricht üblich sind.
- Passe Sprache und Schwierigkeit an das Profil an. Das Deutsch-Niveau ist ${a.deutschNiveau || 'unbekannt'}: benutze kurze, klare Sätze und erkläre schwere Wörter kurz in Klammern.
- Erklärsprache: ${a.erklaerSprache || 'Deutsch (einfach)'}. Erklärart: ${a.erklaerArt || 'Schritt für Schritt'}. Tonfall: ${a.tonfall || 'freundlich'}.
- Bei Sprachübungen (Französisch, Spanisch, Englisch) darfst du in der Zielsprache schreiben, mit deutscher Hilfe.
- Wenn ${name} etwas nicht versteht: Erkläre es noch einmal, einfacher und mit anderen Worten. Frage kurz nach, wo genau die Schwierigkeit liegt.
- ${name} mischt manchmal Deutsch, Englisch und Arabisch. Das ist normal. Verstehe es und antworte trotzdem nach den Regeln oben.
- Formeln schreibst du ohne LaTeX, mit normalen Zeichen: x², √x, ·, ÷, ≤, ≥, π, Δ, →, H₂O.
- Benutze Markdown: **fett** für wichtige Begriffe, Listen, kurze Überschriften (###). Halte Antworten übersichtlich.
- Sei ehrlich. Wenn du etwas nicht sicher weißt, sag es.
- Wenn du etwas NEUES und WICHTIGES über ${name} erfährst (z. B. Prüfungstermin, Schwäche, Wunsch, Lehrer-Thema), schreibe ganz am Ende eine eigene Zeile: [MERKEN: kurzer Satz]. Nur wenn es wirklich neu ist.
${extra}`;
}

function activitySummary() {
  const lines = [];
  const lessons = state.lessons.slice(-5).map(l => `${l.subject}: ${l.topic} (${l.kindLabel})`);
  if (lessons.length) lines.push(`- Letzte Themen: ${lessons.join('; ')}`);
  const results = [];
  for (const q of state.quizzes) {
    const r = q.results?.[q.results.length - 1];
    if (r) results.push({ text: `${q.subject} – ${q.topic}: ${r.score}/${r.total}`, date: r.date });
  }
  results.sort((x, y) => y.date.localeCompare(x.date));
  if (results.length) lines.push(`- Letzte Quiz-Ergebnisse: ${results.slice(0, 6).map(r => r.text).join('; ')}`);
  const decks = state.decks.map(d => `${d.name} (${d.cards.length} Karten)`);
  if (decks.length) lines.push(`- Lernkarten-Stapel: ${decks.slice(0, 8).join(', ')}`);
  if (state.plan?.title) lines.push(`- Aktueller Lernplan: ${state.plan.title}`);
  return lines.join('\n') || '- (noch keine)';
}

// Holt [MERKEN: ...] aus der Antwort und speichert es.
export function extractMemory(text) {
  const re = /\[MERKEN:\s*([^\]]+)\]/gi;
  let m;
  let found = false;
  while ((m = re.exec(text))) {
    const t = m[1].trim();
    if (t && !state.memory.some(x => x.text === t)) {
      state.memory.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: t, date: new Date().toISOString() });
      found = true;
    }
  }
  if (found) {
    state.memory = state.memory.slice(-60);
    save('memory');
  }
  return text.replace(re, '').trim();
}

/**
 * Schickt eine Unterhaltung an die KI und liefert Text Stück für Stück (schnell sichtbar).
 * messages: [{ role: 'user'|'assistant', text, images?: [{mime, data(base64)}] }]
 */
export async function streamChat({ system, messages, onText, json = false, signal }) {
  const s = state.settings;
  if (!aiReady()) throw new Error('Bitte zuerst in den Einstellungen einen KI-Schlüssel eintragen.');
  const clean = normalize(messages);
  if (s.provider === 'claude') return streamClaude({ system, messages: clean, onText, signal, json });
  return streamGemini({ system, messages: clean, onText, json, signal });
}

// Nachrichten müssen abwechseln (Schüler, KI, Schüler ...) und mit dem Schüler beginnen.
function normalize(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.text && !m.images?.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.text = `${last.text}\n\n${m.text}`;
      last.images = [...(last.images || []), ...(m.images || [])];
    } else {
      out.push({ role: m.role, text: m.text || '', images: m.images ? [...m.images] : [] });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ---------- Google Gemini ----------
async function streamGemini({ system, messages, onText, json, signal }) {
  const s = state.settings;
  const model = s.geminiModel || 'gemini-2.5-flash';
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.images || []).map(img => ({ inline_data: { mime_type: img.mime, data: img.data } })),
        { text: m.text || ' ' },
      ],
    })),
    generationConfig: { maxOutputTokens: 16000, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await geminiError(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let blocked = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const obj = JSON.parse(data);
        const parts = obj.candidates?.[0]?.content?.parts || [];
        const piece = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
        if (piece) {
          full += piece;
          onText?.(full);
        }
        const reason = obj.candidates?.[0]?.finishReason;
        if (reason === 'SAFETY' || obj.promptFeedback?.blockReason) blocked = 'Die KI hat diese Anfrage aus Sicherheitsgründen abgelehnt.';
      } catch { /* unvollständige Zeile ignorieren */ }
    }
  }
  if (!full && blocked) throw new Error(blocked);
  return full;
}

async function geminiError(res) {
  let msg = `Fehler ${res.status}`;
  try {
    const j = await res.json();
    msg = j.error?.message || msg;
  } catch { /* egal */ }
  if (res.status === 400 && /API key/i.test(msg)) return 'Der Gemini-Schlüssel ist falsch. Bitte in den Einstellungen prüfen.';
  if (res.status === 403) return 'Der Gemini-Schlüssel hat keine Berechtigung. Bitte in den Einstellungen prüfen.';
  if (res.status === 404) return `Das Modell "${state.settings.geminiModel}" gibt es nicht. Tippe in den Einstellungen auf "Bestes Modell suchen".`;
  if (res.status === 429) return 'Zu viele Anfragen in kurzer Zeit (Google-Limit). Warte eine Minute und versuche es noch einmal.';
  if (res.status >= 500) return 'Der Google-Server ist gerade überlastet. Bitte gleich noch einmal versuchen.';
  return msg;
}

// Sucht automatisch das beste schnelle Gemini-Modell.
export async function findBestGeminiModel(key) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) throw new Error(await geminiError(res));
  const j = await res.json();
  const names = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .filter(n => /^gemini-\d/.test(n) && /flash/.test(n) && !/(lite|image|tts|audio|live|exp|preview|thinking|embedding|robotics|computer)/.test(n))
    .filter(n => !/-\d{3}$/.test(n));
  if (!names.length) throw new Error('Kein passendes Gemini-Modell gefunden.');
  const ver = n => parseFloat(n.match(/^gemini-(\d+(?:\.\d+)?)/)[1]);
  names.sort((x, y) => ver(y) - ver(x) || x.length - y.length);
  return names[0];
}

// ---------- Claude (Anthropic) ----------
async function streamClaude({ system, messages, onText, signal }) {
  const s = state.settings;
  if (!anthropicModule) anthropicModule = await import('../vendor/anthropic-sdk.js');
  const Anthropic = anthropicModule.default;
  const client = new Anthropic({ apiKey: s.claudeKey, dangerouslyAllowBrowser: true });

  const stream = client.beta.messages.stream({
    model: s.claudeModel || 'claude-opus-5-5',
    max_tokens: 32000,
    // Niedriger Aufwand = schnelle Antworten.
    output_config: { effort: 'low' },
    // Falls eine Anfrage abgelehnt wird, versucht der Server automatisch ein passendes anderes Modell.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: messages.map(m => ({
      role: m.role,
      content: [
        ...(m.images || []).map(img => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } })),
        { type: 'text', text: m.text || ' ' },
      ],
    })),
  }, { signal });

  let full = '';
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text;
        onText?.(full);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal' && !full) throw new Error('Claude hat diese Anfrage abgelehnt. Bitte anders formulieren.');
  } catch (e) {
    throw new Error(claudeError(e));
  }
  return full;
}

function claudeError(e) {
  const Anthropic = anthropicModule?.default;
  if (Anthropic) {
    if (e instanceof Anthropic.AuthenticationError) return 'Der Claude-Schlüssel ist falsch. Bitte in den Einstellungen prüfen.';
    if (e instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen. Warte kurz und versuche es noch einmal.';
    if (e instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zum Internet oder zum Claude-Server.';
    if (e instanceof Anthropic.APIError && e.status === 400 && /credit/i.test(e.message)) return 'Dein Claude-Guthaben ist leer.';
  }
  return e?.message || String(e);
}

// ---------- JSON-Hilfe ----------
// Fragt die KI nach JSON und liest es sicher aus.
export async function askJSON({ prompt, images = [], onProgress, signal }) {
  const system = systemPrompt('\nWICHTIG: Antworte NUR mit gültigem JSON. Kein Text davor oder danach, keine ```-Blöcke.');
  const text = await streamChat({
    system,
    messages: [{ role: 'user', text: prompt, images }],
    json: true,
    signal,
    onText: t => onProgress?.(t.length),
  });
  return parseJSON(text);
}

export function parseJSON(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try { return JSON.parse(t.slice(start, end + 1)); } catch { /* unten */ }
    }
  }
  throw new Error('Die KI-Antwort war nicht lesbar. Bitte noch einmal versuchen.');
}

// Bild verkleinern (schneller hochladen) und als base64 liefern.
export function fileToImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}
