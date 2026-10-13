// Lern-Seiten: Audio-Lektionen, Quiz, Lernkarten, Lernplan.
import { state, save, uid } from './store.js';
import { askJSON, aiReady, fileToImage } from './ai.js';
import { AudioPlayer, speak, voicesFor, ttsSupported } from './tts.js';
import { $, $$, esc, setView, toast, icon, fmtDate, pickFile, busy, subjectOptions } from './ui.js';
import { askInChat } from './app.js';

const KINDS = {
  vorbereitung: { label: 'Vorbereitung', desc: 'Vor dem Unterricht: Was kommt dran? Welche Begriffe brauche ich?', icon: 'book' },
  vorlesung: { label: 'Audio-Vorlesung', desc: 'Ausführliche Erklärung zum Anhören, mit Denk-Pausen.', icon: 'headphones' },
  zusammenfassung: { label: 'Zusammenfassung', desc: 'Nach dem Unterricht: Das Wichtigste kurz und klar.', icon: 'brain' },
};

function needAI() {
  if (aiReady()) return true;
  toast('Bitte zuerst die KI einrichten.', 'error');
  location.hash = '#/einrichten';
  return false;
}

async function runAI(text, fn) {
  const b = busy(text);
  try {
    return await fn(b);
  } catch (e) {
    if (e.name !== 'AbortError' && !/abort/i.test(e.message)) toast(e.message, 'error');
    return null;
  } finally {
    b.close();
  }
}

// Wiederverwendbarer Bereich: Text oder Foto als Quelle.
function sourceFields() {
  return `
    <details class="source">
      <summary>📎 Eigenes Material hinzufügen (optional)</summary>
      <label class="label" for="srcText">Text (z. B. aus dem Heft oder Buch)</label>
      <textarea class="input" id="srcText" rows="4" placeholder="Hier Text einfügen …"></textarea>
      <div class="row gap mt"><button type="button" class="btn ghost" id="srcPhoto">${icon('camera')} Foto hinzufügen</button><span class="muted small" id="srcInfo"></span></div>
      <div class="previews" id="srcPrev"></div>
    </details>`;
}

function bindSource() {
  const images = [];
  const render = () => {
    $('#srcPrev').innerHTML = images.map((im, i) => `<div class="pv"><img src="${im.preview}" alt=""><button type="button" data-i="${i}">${icon('x')}</button></div>`).join('');
    $$('#srcPrev button').forEach(b => b.onclick = () => { images.splice(+b.dataset.i, 1); render(); });
  };
  $('#srcPhoto').onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try { images.push(await fileToImage(f)); render(); } catch (e) { toast(e.message, 'error'); }
  };
  return { images, text: () => $('#srcText').value.trim() };
}

function sourcePrompt(text, images) {
  let p = '';
  if (text) p += `\n\nBenutze dieses Material vom Schüler als Grundlage:\n"""\n${text.slice(0, 20000)}\n"""`;
  if (images.length) p += `\n\nBenutze auch die ${images.length} Foto(s) vom Schüler (z. B. Buch- oder Heftseiten) als Grundlage.`;
  return p;
}

// ================= Lektionen (Audio) =================
export function viewLessons(params = new URLSearchParams()) {
  let kind = KINDS[params.get('art')] ? params.get('art') : 'vorbereitung';
  const topic = params.get('thema') || '';
  const subj = params.get('fach') || '';
  setView(`
    <section class="page">
      <h1>Lernen & Anhören</h1>
      <div class="card">
        <h2>Neue Lektion erstellen</h2>
        <div class="kind-pick">
          ${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="kind ${k === kind ? 'on' : ''}" data-k="${k}">${icon(v.icon)}<b>${v.label}</b><span>${v.desc}</span></button>`).join('')}
        </div>
        <form id="lessonForm">
          <div class="grid2">
            <div><label class="label" for="subj">Fach</label><select class="input" id="subj">${subjectOptions(subj)}</select></div>
            <div><label class="label" for="len">Länge</label><select class="input" id="len"><option value="kurz">Kurz (ca. 3 Min.)</option><option value="mittel" selected>Mittel (ca. 7 Min.)</option><option value="lang">Lang (ca. 15 Min.)</option></select></div>
          </div>
          <label class="label" for="topic">Thema</label>
          <input class="input" id="topic" placeholder="z. B. Quadratische Funktionen, Französische Revolution, Redoxreaktion" value="${esc(topic)}" required>
          ${sourceFields()}
          <button class="btn primary full mt">${icon('sparkle')} Lektion erstellen</button>
        </form>
      </div>

      <h2 class="section-title">Meine Lektionen</h2>
      <div class="grid-list" id="lessonList"></div>
    </section>`);

  $$('.kind').forEach(b => b.onclick = () => { $$('.kind').forEach(x => x.classList.remove('on')); b.classList.add('on'); kind = b.dataset.k; });
  const src = bindSource();

  const list = [...state.lessons].reverse();
  $('#lessonList').innerHTML = list.length ? list.map(l => `
    <a class="card mini" href="#/lernen/${l.id}">
      <span class="tag">${esc(l.kindLabel)}</span>
      <b>${esc(l.title)}</b>
      <span class="muted small">${esc(l.subject)} · ${fmtDate(l.created)} · ${l.sections.length} Abschnitte</span>
    </a>`).join('') : '<p class="muted">Noch keine Lektionen. Erstelle oben deine erste!</p>';

  $('#lessonForm').onsubmit = async e => {
    e.preventDefault();
    if (!needAI()) return;
    const subject = $('#subj').value;
    const topicVal = $('#topic').value.trim();
    const len = $('#len').value;
    const lesson = await createLesson({ kind, subject, topic: topicVal, len, text: src.text(), images: src.images });
    if (lesson) location.hash = `#/lernen/${lesson.id}`;
  };
}

async function createLesson({ kind, subject, topic, len, text = '', images = [] }) {
  const n = { kurz: '3 bis 4', mittel: '5 bis 7', lang: '9 bis 12' }[len] || '5 bis 7';
  const goal = {
    vorbereitung: 'eine VORBEREITUNG auf den Unterricht. Der Schüler kennt das Thema noch nicht oder nur wenig. Erkläre, worum es geht, warum es wichtig ist, welches Vorwissen man braucht (kurz wiederholen) und die wichtigsten neuen Begriffe. Ziel: Im Unterricht mitkommen und gute Fragen stellen können.',
    vorlesung: 'eine AUDIO-VORLESUNG. Erkläre das Thema gründlich und verständlich, wie ein sehr guter Lehrer, Schritt für Schritt, mit Beispielen aus dem Alltag.',
    zusammenfassung: 'eine ZUSAMMENFASSUNG nach dem Unterricht. Fasse das Wichtigste klar und kurz zusammen, so wie man es für eine Klassenarbeit braucht.',
  }[kind];
  const prompt = `Erstelle ${goal}
Fach: ${subject}
Thema: ${topic}
Anzahl Abschnitte: ${n}
Der Text wird VORGELESEN. Schreibe deshalb gesprochene Sprache: kurze Sätze, keine Tabellen, keine Aufzählungszeichen im Feld "text", Formeln in Worten ("x hoch zwei").
Jeder Abschnitt behandelt EINE Idee. Nach jedem Abschnitt macht der Schüler eine Denk-Pause.
${sourcePrompt(text, images)}

Antworte als JSON mit genau diesem Aufbau:
{
  "title": "kurzer Titel",
  "intro": "1–2 Sätze: Worum geht es?",
  "sections": [ { "heading": "Überschrift", "text": "gesprochener Text, 4–8 Sätze", "keyPoints": ["Stichpunkt", "Stichpunkt"] } ],
  "terms": [ { "term": "Fachbegriff", "meaning": "einfache Erklärung" } ],
  "summary": ["wichtigster Merksatz", "…"],
  "selfTest": [ { "q": "Frage zum Selbsttest", "a": "kurze Antwort" } ]
}`;
  return runAI(`${KINDS[kind].label} wird erstellt …`, async b => {
    const data = await askJSON({ prompt, images, signal: b.signal, onProgress: n => b.progress(n) });
    if (!data?.sections?.length) throw new Error('Die KI hat keine Abschnitte geliefert. Bitte noch einmal versuchen.');
    const lesson = {
      id: uid(), kind, kindLabel: KINDS[kind].label, subject, topic,
      title: data.title || topic,
      intro: data.intro || '',
      sections: data.sections.map(s => ({ heading: String(s.heading || ''), text: String(s.text || ''), keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [] })),
      terms: Array.isArray(data.terms) ? data.terms : [],
      summary: Array.isArray(data.summary) ? data.summary.map(String) : [],
      selfTest: Array.isArray(data.selfTest) ? data.selfTest : [],
      created: new Date().toISOString(),
    };
    state.lessons.push(lesson);
    save('lessons');
    return lesson;
  });
}

export function viewLesson(id) {
  const l = state.lessons.find(x => x.id === id);
  if (!l) { location.hash = '#/lernen'; return; }
  const s = state.settings;
  const audioSections = [{ heading: l.title, text: l.intro }, ...l.sections, ...(l.summary.length ? [{ heading: 'Zusammenfassung', text: l.summary.join(' ') }] : [])];

  setView(`
    <section class="page lesson">
      <a href="#/lernen" class="back no-print">${icon('back')} Alle Lektionen</a>
      <span class="tag">${esc(l.kindLabel)} · ${esc(l.subject)}</span>
      <h1>${esc(l.title)}</h1>
      ${l.intro ? `<p class="lead">${esc(l.intro)}</p>` : ''}

      <div class="player card no-print" id="player">
        <div class="player-now">
          <div class="eq" id="eq"><i></i><i></i><i></i><i></i></div>
          <div class="grow"><b id="pTitle">Bereit zum Anhören</b><p class="muted small" id="pSub">${audioSections.length} Abschnitte · Denk-Pause ${s.pauseMin}–${s.pauseMax} Sek.</p></div>
        </div>
        <div class="pbar"><div id="pBar"></div></div>
        <div class="player-btns">
          <button class="btn ghost icon-btn" id="pPrev" aria-label="Zurück">${icon('prev')}</button>
          <button class="btn primary play" id="pPlay" aria-label="Abspielen">${icon('play')}</button>
          <button class="btn ghost icon-btn" id="pNext" aria-label="Weiter">${icon('next')}</button>
        </div>
        <details class="player-settings">
          <summary>⚙️ Stimme, Tempo, Pausen</summary>
          ${ttsSupported() ? `
          <label class="label" for="pVoice">Stimme</label><select class="input" id="pVoice"></select>
          <label class="label">Tempo: <b id="pRateVal">${s.rate.toFixed(2)}×</b></label>
          <input type="range" id="pRate" min="0.5" max="2" step="0.05" value="${s.rate}">
          <label class="label">Denk-Pause (Sekunden)</label>
          <div class="row gap"><span class="muted">von</span><input type="number" class="input num" id="ppMin" min="0" max="120" value="${s.pauseMin}"><span class="muted">bis</span><input type="number" class="input num" id="ppMax" min="0" max="120" value="${s.pauseMax}"></div>
          <div class="chips mt">${[[0, 0], [10, 20], [20, 40], [40, 60]].map(([a, b]) => `<button type="button" class="chip" data-a="${a}" data-b="${b}">${a === 0 ? 'Keine' : `${a}–${b} s`}</button>`).join('')}</div>
          ` : '<p>Dein Browser kann leider nicht vorlesen.</p>'}
        </details>
      </div>

      <div id="sections">
        ${l.sections.map((sec, i) => `
          <article class="card section" data-i="${i + 1}">
            <h2><span class="num">${i + 1}</span>${esc(sec.heading)}</h2>
            <p>${esc(sec.text)}</p>
            ${sec.keyPoints.length ? `<ul class="keypoints">${sec.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
            <button class="btn ghost small-btn no-print" data-play="${i + 1}">${icon('play')} Ab hier anhören</button>
          </article>`).join('')}
      </div>

      ${l.terms.length ? `<div class="card"><h2>📖 Wichtige Begriffe</h2><dl class="terms">${l.terms.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd>`).join('')}</dl></div>` : ''}
      ${l.summary.length ? `<div class="card summary"><h2>⭐ Das musst du dir merken</h2><ul>${l.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${l.selfTest.length ? `<div class="card"><h2>✅ Selbsttest</h2>${l.selfTest.map((t, i) => `<details class="selftest"><summary><b>${i + 1}.</b> ${esc(t.q)}</summary><p class="answer">${esc(t.a)}</p></details>`).join('')}</div>` : ''}

      <div class="row gap wrap no-print actions">
        <button class="btn primary" id="toQuiz">${icon('quiz')} Quiz dazu</button>
        <button class="btn ghost" id="toCards">${icon('cards')} Lernkarten dazu</button>
        <button class="btn ghost" id="toChat">${icon('chat')} Im Chat fragen</button>
        <button class="btn ghost" id="print">${icon('print')} Drucken / PDF</button>
        <button class="btn danger-outline" id="del">${icon('trash')} Löschen</button>
      </div>
    </section>`);

  const player = new AudioPlayer(audioSections, {
    onUpdate: st => {
      if (!$('#pPlay')) return;
      $('#pPlay').innerHTML = st.playing ? icon('pause') : icon('play');
      $('#eq').classList.toggle('on', st.playing && !st.pauseLeft);
      $('#pBar').style.width = `${Math.round((st.sec / st.total) * 100)}%`;
      const cur = audioSections[Math.min(st.sec, audioSections.length - 1)];
      if (st.finished) { $('#pTitle').textContent = 'Fertig! 🎉'; $('#pSub').textContent = 'Mach jetzt den Selbsttest oder ein Quiz.'; $('#pBar').style.width = '100%'; }
      else if (st.pauseLeft) { $('#pTitle').textContent = `🧠 Denk-Pause: ${st.pauseLeft} s`; $('#pSub').textContent = 'Denk über das Gehörte nach. (Weiter-Taste = Pause überspringen)'; }
      else { $('#pTitle').textContent = `${st.sec + 1}/${st.total}: ${cur.heading}`; $('#pSub').textContent = st.sentence || ''; }
      $$('.section').forEach(el => el.classList.toggle('current', +el.dataset.i === st.sec && st.playing));
    },
  });

  $('#pPlay').onclick = () => (player.playing ? player.pause() : player.play());
  $('#pNext').onclick = () => player.next();
  $('#pPrev').onclick = () => player.prev();
  $$('[data-play]').forEach(b => b.onclick = () => { player.goTo(+b.dataset.play); $('#player').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  if (ttsSupported()) {
    voicesFor('de').then(list => {
      const sel = $('#pVoice');
      if (!sel) return;
      sel.innerHTML = list.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('') || '<option>Keine deutsche Stimme</option>';
      sel.onchange = () => { state.settings.voiceURI = sel.value; save('settings'); };
    });
    $('#pRate').oninput = e => { state.settings.rate = +e.target.value; $('#pRateVal').textContent = `${state.settings.rate.toFixed(2)}×`; save('settings'); };
    const setP = (a, b) => {
      a = Math.max(0, +a || 0); b = Math.max(a, +b || 0);
      state.settings.pauseMin = a; state.settings.pauseMax = b;
      $('#ppMin').value = a; $('#ppMax').value = b;
      save('settings');
    };
    $('#ppMin').onchange = () => setP($('#ppMin').value, $('#ppMax').value);
    $('#ppMax').onchange = () => setP($('#ppMin').value, $('#ppMax').value);
    $$('.player-settings .chip').forEach(c => c.onclick = () => setP(c.dataset.a, c.dataset.b));
  }

  $('#toQuiz').onclick = () => { if (needAI()) createQuiz({ subject: l.subject, topic: l.topic, count: 10, level: 'mittel', text: lessonText(l), images: [] }).then(q => q && (location.hash = `#/quiz/${q.id}`)); };
  $('#toCards').onclick = () => { if (needAI()) cardsFromLesson(l); };
  $('#toChat').onclick = () => askInChat(`Ich habe gerade die Lektion „${l.title}“ (${l.subject}) gelernt. Kannst du mir dazu Fragen stellen und prüfen, ob ich es verstanden habe? Eine Frage nach der anderen.`);
  $('#print').onclick = () => window.print();
  $('#del').onclick = () => {
    if (!confirm('Diese Lektion löschen?')) return;
    state.lessons = state.lessons.filter(x => x.id !== l.id);
    save('lessons');
    location.hash = '#/lernen';
  };

  return () => player.stop();
}

function lessonText(l) {
  return [l.title, l.intro, ...l.sections.map(s => `${s.heading}: ${s.text}`), ...l.summary].join('\n');
}

async function cardsFromLesson(l) {
  const cards = await runAI('Lernkarten werden erstellt …', b => aiCards({ text: lessonText(l), images: [], hint: `Fachbegriffe und wichtige Fakten zum Thema ${l.topic}`, signal: b.signal, onProgress: n => b.progress(n) }));
  if (!cards) return;
  const deck = { id: uid(), name: `${l.subject}: ${l.title}`.slice(0, 60), subject: l.subject, frontLang: 'de', backLang: 'de', cards: [], created: new Date().toISOString() };
  addCards(deck, cards);
  state.decks.push(deck);
  save('decks');
  toast(`${cards.length} Karten erstellt ✅`, 'ok');
  location.hash = `#/karten/${deck.id}`;
}

// ================= Quiz =================
export function viewQuizzes() {
  setView(`
    <section class="page">
      <h1>Quiz</h1>
      <div class="card">
        <h2>Neues Quiz</h2>
        <form id="quizForm">
          <div class="grid2">
            <div><label class="label" for="qSubj">Fach</label><select class="input" id="qSubj">${subjectOptions()}</select></div>
            <div><label class="label" for="qCount">Fragen</label><select class="input" id="qCount"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></div>
          </div>
          <label class="label" for="qTopic">Thema</label>
          <input class="input" id="qTopic" placeholder="z. B. Zellbiologie, Passé composé, Ableitungen" required>
          <label class="label">Schwierigkeit</label>
          <div class="seg" id="qLevel">
            <button type="button" data-v="leicht">Leicht</button>
            <button type="button" data-v="mittel" class="on">Mittel</button>
            <button type="button" data-v="schwer">Schwer (Klausur)</button>
          </div>
          ${sourceFields()}
          <button class="btn primary full mt">${icon('sparkle')} Quiz erstellen</button>
        </form>
      </div>
      <h2 class="section-title">Meine Quizze</h2>
      <div class="grid-list" id="quizList"></div>
    </section>`);

  let level = 'mittel';
  $$('#qLevel button').forEach(b => b.onclick = () => { $$('#qLevel button').forEach(x => x.classList.remove('on')); b.classList.add('on'); level = b.dataset.v; });
  const src = bindSource();
  const list = [...state.quizzes].reverse();
  $('#quizList').innerHTML = list.length ? list.map(q => {
    const best = q.results?.length ? Math.max(...q.results.map(r => Math.round((r.score / r.total) * 100))) : null;
    return `<a class="card mini" href="#/quiz/${q.id}"><span class="tag">${esc(q.subject)}</span><b>${esc(q.title)}</b><span class="muted small">${q.questions.length} Fragen · ${best === null ? 'noch nicht gemacht' : `Bestes Ergebnis: ${best} %`}</span></a>`;
  }).join('') : '<p class="muted">Noch keine Quizze.</p>';

  $('#quizForm').onsubmit = async e => {
    e.preventDefault();
    if (!needAI()) return;
    const q = await createQuiz({ subject: $('#qSubj').value, topic: $('#qTopic').value.trim(), count: +$('#qCount').value, level, text: src.text(), images: src.images });
    if (q) location.hash = `#/quiz/${q.id}`;
  };
}

async function createQuiz({ subject, topic, count, level, text, images }) {
  const prompt = `Erstelle ein Multiple-Choice-Quiz.
Fach: ${subject}
Thema: ${topic}
Anzahl Fragen: ${count}
Schwierigkeit: ${level}${level === 'schwer' ? ' (wie in einer Klassenarbeit / Klausur, auch Anwendungs- und Transferfragen)' : ''}
Jede Frage hat genau 4 Antworten, genau eine ist richtig. Mische die Position der richtigen Antwort.
Die Erklärung ist kurz und einfach und sagt, WARUM die Antwort richtig ist.
Bei Sprachen (Französisch, Spanisch, Englisch) dürfen Fragen und Antworten in der Zielsprache sein.${sourcePrompt(text, images)}

Antworte als JSON:
{ "title": "kurzer Titel", "questions": [ { "question": "…", "options": ["…","…","…","…"], "correct": 0, "explanation": "…" } ] }`;
  return runAI('Quiz wird erstellt …', async b => {
    const data = await askJSON({ prompt, images, signal: b.signal, onProgress: n => b.progress(n) });
    const questions = (data.questions || []).filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2)
      .map(q => ({ question: String(q.question), options: q.options.map(String), correct: Math.max(0, Math.min(q.options.length - 1, +q.correct || 0)), explanation: String(q.explanation || '') }));
    if (!questions.length) throw new Error('Die KI hat keine Fragen geliefert. Bitte noch einmal versuchen.');
    const quiz = { id: uid(), subject, topic, title: data.title || topic, questions, results: [], created: new Date().toISOString() };
    state.quizzes.push(quiz);
    save('quizzes');
    return quiz;
  });
}

export function viewQuiz(id) {
  const quiz = state.quizzes.find(q => q.id === id);
  if (!quiz) { location.hash = '#/quiz'; return; }
  let i = 0;
  let score = 0;
  const wrong = [];

  function renderQ() {
    const q = quiz.questions[i];
    setView(`
      <section class="page narrow quiz-play">
        <a href="#/quiz" class="back">${icon('back')} Alle Quizze</a>
        <div class="row space"><span class="tag">${esc(quiz.subject)} · ${esc(quiz.title)}</span><span class="muted">${i + 1} / ${quiz.questions.length}</span></div>
        <div class="progress"><div style="width:${(i / quiz.questions.length) * 100}%"></div></div>
        <h2 class="question">${esc(q.question)}</h2>
        <div class="options">${q.options.map((o, k) => `<button class="option" data-k="${k}"><span class="letter">${'ABCD'[k] || k + 1}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="feedback"></div>
      </section>`);
    $$('.option').forEach(b => b.onclick = () => answer(+b.dataset.k));
  }

  function answer(k) {
    const q = quiz.questions[i];
    const ok = k === q.correct;
    if (ok) score++; else wrong.push({ q: q.question, your: q.options[k], right: q.options[q.correct] });
    $$('.option').forEach(b => {
      b.disabled = true;
      const kk = +b.dataset.k;
      if (kk === q.correct) b.classList.add('right');
      else if (kk === k) b.classList.add('wrong');
    });
    $('#feedback').innerHTML = `
      <div class="card feedback ${ok ? 'ok' : 'bad'}">
        <b>${ok ? '✅ Richtig!' : '❌ Leider falsch.'}</b>
        ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}
        <div class="row gap wrap">
          <button class="btn ghost small-btn" id="hear">${icon('speaker')} Vorlesen</button>
          <button class="btn primary grow" id="next">${i + 1 < quiz.questions.length ? 'Nächste Frage' : 'Ergebnis ansehen'}</button>
        </div>
      </div>`;
    $('#hear').onclick = () => speak(`${q.question}. Richtige Antwort: ${q.options[q.correct]}. ${q.explanation}`);
    $('#next').onclick = () => { i++; i < quiz.questions.length ? renderQ() : renderResult(); };
    $('#next').focus();
  }

  function renderResult() {
    const total = quiz.questions.length;
    const pct = Math.round((score / total) * 100);
    quiz.results.push({ date: new Date().toISOString(), score, total });
    save('quizzes');
    const msg = pct >= 90 ? 'Hervorragend! 🏆' : pct >= 70 ? 'Sehr gut! 💪' : pct >= 50 ? 'Gut, aber da geht noch mehr! 🙂' : 'Nicht schlimm – Übung macht den Meister! 🌱';
    setView(`
      <section class="page narrow">
        <a href="#/quiz" class="back">${icon('back')} Alle Quizze</a>
        <div class="card result">
          <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
          <h1>${msg}</h1>
          <p class="lead">${score} von ${total} richtig</p>
        </div>
        ${wrong.length ? `<div class="card"><h2>Das solltest du wiederholen</h2>${wrong.map(w => `<div class="wrong-item"><b>${esc(w.q)}</b><p>Deine Antwort: <s>${esc(w.your)}</s><br>Richtig: <strong>${esc(w.right)}</strong></p></div>`).join('')}</div>` : ''}
        <div class="row gap wrap">
          <button class="btn primary" id="again">Nochmal</button>
          ${wrong.length ? `<button class="btn ghost" id="explain">${icon('chat')} Fehler erklären lassen</button>` : ''}
          <button class="btn ghost" id="more">${icon('sparkle')} Neues Quiz zum Thema</button>
          <button class="btn danger-outline" id="del">${icon('trash')}</button>
        </div>
      </section>`);
    $('#again').onclick = () => { i = 0; score = 0; wrong.length = 0; renderQ(); };
    $('#explain')?.addEventListener('click', () => askInChat(`Ich habe ein Quiz zu „${quiz.topic}“ (${quiz.subject}) gemacht. Diese Fragen hatte ich falsch:\n${wrong.map(w => `- ${w.q} (meine Antwort: ${w.your}, richtig: ${w.right})`).join('\n')}\nBitte erkläre mir einfach, warum, und gib mir danach eine ähnliche Übungsaufgabe.`));
    $('#more').onclick = () => createQuiz({ subject: quiz.subject, topic: quiz.topic, count: total, level: 'mittel', text: wrong.length ? `Konzentriere dich besonders auf diese Schwächen:\n${wrong.map(w => w.q).join('\n')}` : '', images: [] }).then(q => q && (location.hash = `#/quiz/${q.id}`));
    $('#del').onclick = () => { if (confirm('Dieses Quiz löschen?')) { state.quizzes = state.quizzes.filter(q => q.id !== quiz.id); save('quizzes'); location.hash = '#/quiz'; } };
  }

  renderQ();
}

// ================= Lernkarten =================
const LANGS = { de: 'Deutsch', fr: 'Französisch', es: 'Spanisch', en: 'Englisch', ar: 'Arabisch', la: 'Latein' };
const LANG_OPTS = sel => Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
const INTERVALS = [0, 1, 3, 7, 16, 35]; // Tage pro Box (Leitner-System)

export function dueCards(deck) {
  const now = Date.now();
  return deck.cards.filter(c => !c.due || c.due <= now);
}

function addCards(deck, list) {
  for (const c of list) {
    const front = String(c.front || '').trim();
    const back = String(c.back || '').trim();
    if (front && back) deck.cards.push({ id: uid(), front, back, box: 0, due: 0 });
  }
}

async function aiCards({ text, images, hint, signal, onProgress }) {
  const prompt = `Erstelle Lernkarten (Karteikarten).
${hint ? `Hinweis: ${hint}\n` : ''}Wenn es Vokabeln sind: Vorderseite = Wort in der Fremdsprache (bei Nomen mit Artikel, z. B. "la maison"), Rückseite = deutsche Bedeutung.
Wenn es Fachwissen ist: Vorderseite = kurze Frage oder Begriff, Rückseite = kurze, einfache Antwort.
Nimm ALLE Vokabeln/Begriffe, die du findest. Erfinde nichts dazu, wenn Material gegeben ist.${sourcePrompt(text, images)}

Antworte als JSON: { "cards": [ { "front": "…", "back": "…" } ], "frontLang": "fr|es|en|de|ar|la", "backLang": "de" }`;
  const data = await askJSON({ prompt, images, signal, onProgress });
  const cards = (data.cards || []).filter(c => c.front && c.back);
  if (!cards.length) throw new Error('Keine Karten gefunden. Ist das Foto scharf genug?');
  cards.frontLang = data.frontLang;
  cards.backLang = data.backLang;
  return cards;
}

export function viewDecks() {
  setView(`
    <section class="page">
      <h1>Lernkarten</h1>
      <div class="card">
        <h2>Neuer Stapel</h2>
        <form id="deckForm">
          <label class="label" for="dName">Name</label>
          <input class="input" id="dName" placeholder="z. B. Französisch Unité 3" required>
          <div class="grid3">
            <div><label class="label" for="dSubj">Fach</label><select class="input" id="dSubj">${subjectOptions()}</select></div>
            <div><label class="label" for="dFront">Vorderseite</label><select class="input" id="dFront">${LANG_OPTS('fr')}</select></div>
            <div><label class="label" for="dBack">Rückseite</label><select class="input" id="dBack">${LANG_OPTS('de')}</select></div>
          </div>
          <button class="btn primary full mt">${icon('plus')} Stapel erstellen</button>
        </form>
        <p class="muted small mt">Danach kannst du Karten per <b>Foto</b>, per <b>Text</b> oder von Hand hinzufügen.</p>
      </div>
      <h2 class="section-title">Meine Stapel</h2>
      <div class="grid-list" id="deckList"></div>
    </section>`);

  const fr = $('#dFront');
  $('#dSubj').onchange = e => {
    const m = { 'Französisch': 'fr', 'Spanisch': 'es', 'Englisch': 'en', 'Latein': 'la' }[e.target.value];
    fr.value = m || 'de';
  };
  $('#deckList').innerHTML = state.decks.length ? [...state.decks].reverse().map(d => {
    const due = dueCards(d).length;
    return `<a class="card mini" href="#/karten/${d.id}"><span class="tag">${esc(d.subject || '')}</span><b>${esc(d.name)}</b><span class="muted small">${d.cards.length} Karten · ${due ? `<span class="due">${due} fällig</span>` : 'alles gelernt ✅'}</span></a>`;
  }).join('') : '<p class="muted">Noch keine Stapel.</p>';

  $('#deckForm').onsubmit = e => {
    e.preventDefault();
    const deck = { id: uid(), name: $('#dName').value.trim(), subject: $('#dSubj').value, frontLang: $('#dFront').value, backLang: $('#dBack').value, cards: [], created: new Date().toISOString() };
    state.decks.push(deck);
    save('decks');
    location.hash = `#/karten/${deck.id}`;
  };
}

export function viewDeck(id) {
  const deck = state.decks.find(d => d.id === id);
  if (!deck) { location.hash = '#/karten'; return; }
  const due = dueCards(deck).length;

  setView(`
    <section class="page">
      <a href="#/karten" class="back no-print">${icon('back')} Alle Stapel</a>
      <div class="row space wrap">
        <div><span class="tag">${esc(deck.subject || '')} · ${LANGS[deck.frontLang] || ''} → ${LANGS[deck.backLang] || ''}</span><h1>${esc(deck.name)}</h1></div>
      </div>
      <div class="row gap wrap no-print">
        <a class="btn primary xl ${deck.cards.length ? '' : 'disabled'}" href="#/karten/${deck.id}/lernen">${icon('play')} Lernen ${due ? `(${due} fällig)` : ''}</a>
        <a class="btn ghost" href="#/karten/${deck.id}/lernen?alle=1">Alle üben</a>
      </div>

      <div class="card no-print">
        <h2>Karten hinzufügen</h2>
        <div class="tabs" id="addTabs">
          <button data-t="photo" class="on">${icon('camera')} Foto</button>
          <button data-t="text">Text / Liste</button>
          <button data-t="hand">Von Hand</button>
        </div>
        <div id="addPane"></div>
      </div>

      <div class="card">
        <div class="row space"><h2>${deck.cards.length} Karten</h2><button class="btn ghost small-btn no-print" id="print">${icon('print')} Drucken</button></div>
        <div class="card-table" id="cardTable"></div>
      </div>
      <button class="btn danger-outline no-print" id="delDeck">${icon('trash')} Stapel löschen</button>
    </section>`);

  function renderTable() {
    $('#cardTable').innerHTML = deck.cards.length ? deck.cards.map(c => `
      <div class="ct-row"><span class="f">${esc(c.front)}</span><span class="b">${esc(c.back)}</span>
      <span class="box no-print" title="Box">${'●'.repeat(c.box)}${'○'.repeat(5 - c.box)}</span>
      <button class="del no-print" data-id="${c.id}" aria-label="Löschen">${icon('trash')}</button></div>`).join('') : '<p class="muted">Noch keine Karten.</p>';
    $$('#cardTable .del').forEach(b => b.onclick = () => { deck.cards = deck.cards.filter(c => c.id !== b.dataset.id); save('decks'); renderTable(); });
  }

  function afterAdd(n) {
    save('decks');
    toast(`${n} Karte${n === 1 ? '' : 'n'} hinzugefügt ✅`, 'ok');
    viewDeck(id);
  }

  function pane(t) {
    $$('#addTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'photo') {
      $('#addPane').innerHTML = `
        <p>Mach ein Foto von deiner Vokabelliste oder Buchseite. Die KI macht daraus Karten.</p>
        <div class="row gap wrap"><button class="btn primary" id="shoot">${icon('camera')} Foto aufnehmen / wählen</button></div>
        <div class="previews" id="phPrev"></div>
        <button class="btn primary full mt hidden" id="phGo">${icon('sparkle')} Karten erstellen</button>`;
      const imgs = [];
      $('#shoot').onclick = async () => {
        const f = await pickFile('image/*');
        if (!f) return;
        try { imgs.push(await fileToImage(f, 2000)); } catch (e) { toast(e.message, 'error'); return; }
        $('#phPrev').innerHTML = imgs.map(im => `<div class="pv"><img src="${im.preview}" alt=""></div>`).join('');
        $('#phGo').classList.remove('hidden');
      };
      $('#phGo').onclick = async () => {
        if (!needAI()) return;
        const cards = await runAI('Ich lese das Foto …', b => aiCards({ text: '', images: imgs, hint: `Stapel "${deck.name}", ${LANGS[deck.frontLang]} → ${LANGS[deck.backLang]}`, signal: b.signal, onProgress: n => b.progress(n) }));
        if (cards) { addCards(deck, cards); afterAdd(cards.length); }
      };
    } else if (t === 'text') {
      $('#addPane').innerHTML = `
        <p>Eine Karte pro Zeile: <code>Vorderseite - Rückseite</code> (auch <code>=</code>, <code>;</code> oder Tab). Oder füge einen ganzen Text ein und lass die KI Karten machen.</p>
        <textarea class="input" id="bulk" rows="6" placeholder="la maison - das Haus&#10;le chien - der Hund"></textarea>
        <div class="row gap wrap mt"><button class="btn primary" id="parse">Liste übernehmen (ohne KI)</button><button class="btn ghost" id="aiText">${icon('sparkle')} KI macht Karten aus dem Text</button></div>`;
      $('#parse').onclick = () => {
        const list = $('#bulk').value.split('\n').map(line => {
          const m = line.split(/\s+[-–—=]\s+|\t|;|\s*=\s*/);
          return m.length >= 2 ? { front: m[0], back: m.slice(1).join(', ') } : null;
        }).filter(Boolean);
        if (!list.length) { toast('Keine Zeilen gefunden. Format: Wort - Übersetzung'); return; }
        addCards(deck, list);
        afterAdd(list.length);
      };
      $('#aiText').onclick = async () => {
        const text = $('#bulk').value.trim();
        if (!text) { toast('Bitte zuerst Text einfügen.'); return; }
        if (!needAI()) return;
        const cards = await runAI('Karten werden erstellt …', b => aiCards({ text, images: [], hint: `Stapel "${deck.name}", ${LANGS[deck.frontLang]} → ${LANGS[deck.backLang]}`, signal: b.signal, onProgress: n => b.progress(n) }));
        if (cards) { addCards(deck, cards); afterAdd(cards.length); }
      };
    } else {
      $('#addPane').innerHTML = `
        <form id="handForm" class="grid2">
          <div><label class="label" for="hf">Vorderseite</label><input class="input" id="hf" required autocomplete="off"></div>
          <div><label class="label" for="hb">Rückseite</label><input class="input" id="hb" required autocomplete="off"></div>
          <button class="btn primary full span2">${icon('plus')} Hinzufügen</button>
        </form>`;
      $('#hf').focus();
      $('#handForm').onsubmit = e => {
        e.preventDefault();
        addCards(deck, [{ front: $('#hf').value, back: $('#hb').value }]);
        save('decks');
        $('#hf').value = '';
        $('#hb').value = '';
        $('#hf').focus();
        renderTable();
        toast('Hinzugefügt ✅', 'ok');
      };
    }
  }

  $$('#addTabs button').forEach(b => b.onclick = () => pane(b.dataset.t));
  pane('photo');
  renderTable();
  $('#print').onclick = () => window.print();
  $('#delDeck').onclick = () => { if (confirm('Ganzen Stapel löschen?')) { state.decks = state.decks.filter(d => d.id !== deck.id); save('decks'); location.hash = '#/karten'; } };
}

export function viewLearnDeck(id) {
  const deck = state.decks.find(d => d.id === id);
  if (!deck) { location.hash = '#/karten'; return; }
  const all = location.hash.includes('alle=1');
  let queue = (all ? [...deck.cards] : dueCards(deck)).sort(() => Math.random() - 0.5);
  let known = 0;
  let seen = 0;
  let flipped = false;

  function render() {
    if (!queue.length) {
      setView(`
        <section class="page narrow center">
          <div class="card result">
            <div class="big-emoji">🎉</div>
            <h1>${seen ? 'Geschafft!' : 'Heute nichts fällig'}</h1>
            <p class="lead">${seen ? `${known} von ${seen} Karten gewusst.` : 'Alle Karten sind gelernt. Komm morgen wieder!'}</p>
            <div class="row gap center wrap">
              <a class="btn primary" href="#/karten/${deck.id}">Zum Stapel</a>
              <a class="btn ghost" href="#/karten/${deck.id}/lernen?alle=1&t=${Date.now()}">Alle nochmal üben</a>
            </div>
          </div>
        </section>`);
      return;
    }
    const c = queue[0];
    flipped = false;
    setView(`
      <section class="page narrow learn">
        <div class="row space"><a href="#/karten/${deck.id}" class="back">${icon('back')} ${esc(deck.name)}</a><span class="muted">${queue.length} übrig</span></div>
        <div class="flashcard" id="fc" tabindex="0">
          <div class="fc-inner">
            <div class="fc-face front"><span class="fc-lang">${LANGS[deck.frontLang] || ''}</span><p>${esc(c.front)}</p><span class="muted small">Tippen zum Umdrehen</span></div>
            <div class="fc-face back"><span class="fc-lang">${LANGS[deck.backLang] || ''}</span><p>${esc(c.back)}</p></div>
          </div>
        </div>
        <div class="row gap center"><button class="btn ghost" id="say">${icon('speaker')} Anhören</button></div>
        <div class="learn-btns hidden" id="rate">
          <button class="btn bad-btn" id="no">${icon('x')} Nochmal</button>
          <button class="btn ok-btn" id="yes">${icon('check')} Gewusst</button>
        </div>
      </section>`);
    const flip = () => { flipped = !flipped; $('#fc').classList.toggle('flipped', flipped); $('#rate').classList.remove('hidden'); };
    $('#fc').onclick = flip;
    $('#fc').onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    $('#say').onclick = () => (flipped ? speak(c.back, deck.backLang) : speak(c.front, deck.frontLang));
    $('#yes').onclick = () => rate(true);
    $('#no').onclick = () => rate(false);
    if (deck.frontLang !== 'de') speak(c.front, deck.frontLang);
  }

  function rate(ok) {
    const c = queue.shift();
    seen++;
    if (ok) {
      known++;
      c.box = Math.min(5, c.box + 1);
      c.due = Date.now() + INTERVALS[c.box] * 86400000 - 3600000;
    } else {
      c.box = 0;
      c.due = 0;
      queue.splice(Math.min(queue.length, 3), 0, c); // gleich nochmal zeigen
      seen--;
    }
    save('decks');
    render();
  }

  const keys = e => {
    if (!$('#rate') || $('#rate').classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === '2') rate(true);
    if (e.key === 'ArrowLeft' || e.key === '1') rate(false);
  };
  document.addEventListener('keydown', keys);
  render();
  return () => document.removeEventListener('keydown', keys);
}

// ================= Lernplan & Lehrplan-Themen =================
export function viewPlan() {
  const a = state.profile.answers;
  const subs = (a.faecher && a.faecher.length) ? a.faecher : ['Mathe', 'Deutsch', 'Englisch'];
  setView(`
    <section class="page">
      <h1>Lernplan</h1>
      <p class="muted">Klasse ${esc(a.klasse || '?')} · ${esc(a.schulart || '')} · ${esc(a.bundesland || '')}</p>

      <div class="card">
        <div class="row space wrap"><h2>📅 Mein Wochenplan</h2>
          <div class="row gap no-print">${state.plan ? `<button class="btn ghost small-btn" id="printPlan">${icon('print')} Drucken</button>` : ''}</div>
        </div>
        <div id="planBox"></div>
        <details class="no-print mt" ${state.plan ? '' : 'open'}>
          <summary><b>${state.plan ? 'Neuen Plan erstellen' : 'Plan erstellen'}</b></summary>
          <label class="label" for="pWeeks">Für wie viele Wochen?</label>
          <select class="input" id="pWeeks"><option>1</option><option selected>2</option><option>4</option><option>6</option></select>
          <label class="label" for="pFocus">Worauf soll ich achten? (Prüfungen, Schwächen …)</label>
          <textarea class="input" id="pFocus" rows="2" placeholder="z. B. Mathe-Arbeit am 20.10. über Funktionen, Französisch Vokabeln">${esc(a.pruefungen || '')}</textarea>
          <button class="btn primary full mt" id="makePlan">${icon('sparkle')} Lernplan erstellen</button>
        </details>
      </div>

      <div class="card no-print">
        <h2>📚 Themen aus dem Lehrplan</h2>
        <p class="muted small">Wähle ein Fach. Die KI zeigt dir die Themen aus dem Bildungsplan von ${esc(a.bundesland || 'deinem Bundesland')} für deine Klasse. Tippe auf ein Thema, um sofort zu lernen.</p>
        <div class="chips" id="subjChips">${subs.map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div id="topicBox"></div>
      </div>
    </section>`);

  function renderPlan() {
    const p = state.plan;
    if (!p) { $('#planBox').innerHTML = '<p class="muted">Noch kein Plan. Erstelle unten einen – passend zu deinem Profil.</p>'; return; }
    const total = p.weeks.reduce((n, w) => n + w.items.length, 0);
    const done = p.weeks.reduce((n, w) => n + w.items.filter(i => i.done).length, 0);
    $('#planBox').innerHTML = `
      <h3>${esc(p.title)}</h3>
      <div class="progress"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
      <p class="muted small">${done} von ${total} Aufgaben erledigt</p>
      ${p.tips?.length ? `<div class="tips">${p.tips.map(t => `<p>💡 ${esc(t)}</p>`).join('')}</div>` : ''}
      ${p.weeks.map(w => `
        <div class="week">
          <h4>${esc(w.title)}</h4>${w.goal ? `<p class="muted small">Ziel: ${esc(w.goal)}</p>` : ''}
          ${w.items.map(it => `<label class="check-row ${it.done ? 'done' : ''}"><input type="checkbox" data-id="${it.id}" ${it.done ? 'checked' : ''}><span>${it.day ? `<span class="day">${esc(it.day)}</span>` : ''}<b>${esc(it.subject || '')}</b> ${esc(it.task)}${it.minutes ? ` <span class="muted small">(${it.minutes} Min.)</span>` : ''}</span></label>`).join('')}
        </div>`).join('')}`;
    $$('#planBox input').forEach(cb => cb.onchange = () => {
      for (const w of p.weeks) for (const it of w.items) if (it.id === cb.dataset.id) it.done = cb.checked;
      save('plan');
      renderPlan();
    });
  }
  renderPlan();
  $('#printPlan')?.addEventListener('click', () => window.print());

  $('#makePlan').onclick = async () => {
    if (!needAI()) return;
    const weeks = +$('#pWeeks').value;
    const focus = $('#pFocus').value.trim();
    const prompt = `Erstelle einen persönlichen Lernplan für ${weeks} Woche(n), ab heute.
Beachte das Profil (Fächer, schwere Fächer, Lernzeit pro Tag, Konzentration, Prüfungen) und den Bildungsplan des Bundeslandes.
Besondere Wünsche: ${focus || 'keine'}
Plane realistisch: nicht mehr als die angegebene Lernzeit pro Tag. Konkrete Aufgaben (z. B. "10 Vokabeln Unité 3 lernen", "Quiz zu Ableitungen machen", "Audio-Vorlesung zu Zellatmung anhören").
Antworte als JSON:
{ "title": "…", "tips": ["kurzer Lerntipp", "…"], "weeks": [ { "title": "Woche 1 (Datum–Datum)", "goal": "…", "items": [ { "day": "Mo", "subject": "Mathe", "task": "…", "minutes": 20 } ] } ] }`;
    const data = await runAI('Lernplan wird erstellt …', b => askJSON({ prompt, signal: b.signal, onProgress: n => b.progress(n) }));
    if (!data?.weeks?.length) { if (data) toast('Kein Plan erhalten. Bitte nochmal.', 'error'); return; }
    state.plan = {
      title: data.title || 'Mein Lernplan',
      tips: Array.isArray(data.tips) ? data.tips.map(String) : [],
      created: new Date().toISOString(),
      weeks: data.weeks.map(w => ({ title: String(w.title || ''), goal: String(w.goal || ''), items: (w.items || []).map(it => ({ id: uid(), day: String(it.day || ''), subject: String(it.subject || ''), task: String(it.task || ''), minutes: +it.minutes || 0, done: false })) })),
    };
    save('plan');
    viewPlan();
    toast('Dein Lernplan ist fertig ✅', 'ok');
  };

  async function showTopics(subject, refresh = false) {
    $$('#subjChips .chip').forEach(c => c.classList.toggle('on', c.dataset.s === subject));
    const key = `${subject}|${a.bundesland}|${a.klasse}`;
    let data = state.topics[key];
    if (!data || refresh) {
      if (!needAI()) return;
      const prompt = `Liste die Themen im Fach ${subject} für Klasse ${a.klasse} (${a.schulart}) nach dem aktuellen Bildungsplan / Lehrplan von ${a.bundesland}. Ordne sie nach Themenblöcken in der üblichen Reihenfolge des Schuljahres.
Antworte als JSON: { "note": "kurzer Hinweis, falls die Reihenfolge je nach Schule anders ist", "blocks": [ { "title": "Themenblock", "topics": ["Thema", "Thema"] } ] }`;
      data = await runAI(`Lehrplan ${subject} wird geladen …`, b => askJSON({ prompt, signal: b.signal, onProgress: n => b.progress(n) }));
      if (!data?.blocks) return;
      state.topics[key] = data;
      save('topics');
    }
    $('#topicBox').innerHTML = `
      ${data.note ? `<p class="muted small">ℹ️ ${esc(data.note)}</p>` : ''}
      ${data.blocks.map(bl => `<div class="topic-block"><h4>${esc(bl.title)}</h4><div class="topic-list">${(bl.topics || []).map(t => `<button class="topic" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}
      <button class="btn ghost small-btn mt" id="reTopics">Neu laden</button>
      <div id="topicMenu"></div>`;
    $('#reTopics').onclick = () => showTopics(subject, true);
    $$('.topic').forEach(b => b.onclick = () => {
      const t = b.dataset.t;
      const q = `fach=${encodeURIComponent(subject)}&thema=${encodeURIComponent(t)}`;
      $('#topicMenu').innerHTML = `
        <div class="topic-pop card">
          <b>${esc(t)}</b>
          <div class="row gap wrap mt">
            <a class="btn primary small-btn" href="#/lernen?art=vorbereitung&${q}">Vorbereiten</a>
            <a class="btn ghost small-btn" href="#/lernen?art=vorlesung&${q}">Audio-Vorlesung</a>
            <a class="btn ghost small-btn" href="#/lernen?art=zusammenfassung&${q}">Zusammenfassung</a>
            <button class="btn ghost small-btn" id="tQuiz">Quiz</button>
            <button class="btn ghost small-btn" id="tChat">Im Chat erklären</button>
          </div>
        </div>`;
      $('#topicMenu').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      $('#tQuiz').onclick = () => createQuiz({ subject, topic: t, count: 10, level: 'mittel', text: '', images: [] }).then(x => x && (location.hash = `#/quiz/${x.id}`));
      $('#tChat').onclick = () => askInChat(`Erkläre mir bitte das Thema „${t}“ in ${subject}. Fang ganz einfach an.`);
    });
  }
  $$('#subjChips .chip').forEach(c => c.onclick = () => showTopics(c.dataset.s));
}
