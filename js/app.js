// LernPilot – Hauptdatei: Navigation, Start, Fragebogen, Chat, Einstellungen.
import { state, loadState, save, saveNow, uid, streak, exportAll, importAll, resetAll } from './store.js';
import { QUESTIONS } from './questions.js';
import { aiReady, streamChat, systemPrompt, extractMemory, findBestGeminiModel, fileToImage } from './ai.js';
import { voicesFor, speak, stopSpeaking, ttsSupported } from './tts.js';
import { $, $$, esc, setView, toast, icon, md, fmtDate, pickFile, download } from './ui.js';
import { viewLessons, viewLesson, viewQuizzes, viewQuiz, viewDecks, viewDeck, viewLearnDeck, viewPlan, dueCards } from './learn.js';

// ---------------- Navigation ----------------
const NAV = [
  { href: '#/start', label: 'Start', icon: 'home' },
  { href: '#/chat', label: 'Chat', icon: 'chat' },
  { href: '#/lernen', label: 'Lernen', icon: 'headphones' },
  { href: '#/quiz', label: 'Quiz', icon: 'quiz' },
  { href: '#/karten', label: 'Karten', icon: 'cards' },
  { href: '#/plan', label: 'Plan', icon: 'plan' },
];

function renderNav() {
  const hash = location.hash || '#/start';
  const items = NAV.map(n => `<a href="${n.href}" class="nav-item ${hash.startsWith(n.href) ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('');
  $('#sidenav').innerHTML = `
    <div class="brand">${logo()}<span>LernPilot</span></div>
    ${items}
    <div class="nav-spacer"></div>
    <a href="#/einstellungen" class="nav-item ${hash.startsWith('#/einstellungen') ? 'active' : ''}">${icon('settings')}<span>Einstellungen</span></a>`;
  $('#bottomnav').innerHTML = NAV.filter(n => n.href !== '#/plan').map(n => `<a href="${n.href}" class="nav-item ${hash.startsWith(n.href) ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span></a>`).join('');
}

let logoN = 0;
function logo() {
  // Jede Verwendung braucht eine eigene ID, sonst fehlt die Farbe, wenn ein Logo versteckt ist.
  const id = `lg${++logoN}`;
  return `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d4aff"/><stop offset="1" stop-color="#2f80ed"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#${id})"/><path d="M12 30l12-16 12 16-12-5z" fill="#fff"/><path d="M24 25v10" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
}

let cleanup = null;
function route() {
  if (cleanup) { try { cleanup(); } catch { /* egal */ } cleanup = null; }
  stopSpeaking();
  const hash = location.hash || '#/start';
  const [path, query = ''] = hash.slice(2).split('?');
  const parts = path.split('/');
  const params = new URLSearchParams(query);
  document.body.classList.toggle('onboarding', !state.profile.done);

  if (!state.profile.done && parts[0] !== 'willkommen') { location.hash = '#/willkommen'; return; }
  renderNav();

  const r = parts[0];
  const id = parts[1];
  let c;
  switch (r) {
    case 'willkommen': c = viewOnboarding(); break;
    case 'einrichten': c = viewKeySetup(); break;
    case 'start': c = viewStart(); break;
    case 'chat': c = viewChat(id); break;
    case 'lernen': c = id ? viewLesson(id) : viewLessons(params); break;
    case 'quiz': c = id ? viewQuiz(id) : viewQuizzes(); break;
    case 'karten': c = id ? (parts[2] === 'lernen' ? viewLearnDeck(id) : viewDeck(id)) : viewDecks(); break;
    case 'plan': c = viewPlan(); break;
    case 'einstellungen': c = viewSettings(); break;
    default: location.hash = '#/start'; return;
  }
  cleanup = typeof c === 'function' ? c : null;
}

// ---------------- Fragebogen (Kennenlernen) ----------------
let qIndex = 0;

function viewOnboarding() {
  const answers = state.profile.answers;
  if (qIndex === 0 && !answers._started) return renderIntro();
  if (qIndex >= QUESTIONS.length) return renderOnboardingDone();

  const q = QUESTIONS[qIndex];
  const val = answers[q.id];
  const pct = Math.round((qIndex / QUESTIONS.length) * 100);
  let input = '';
  if (q.type === 'text' || q.type === 'number') {
    input = `<input class="input big" id="qInput" type="${q.type === 'number' ? 'number' : 'text'}" inputmode="${q.type === 'number' ? 'numeric' : 'text'}" placeholder="${esc(q.placeholder || '')}" value="${esc(val ?? '')}" autocomplete="off">`;
  } else {
    const sel = Array.isArray(val) ? val : (val ? [val] : []);
    input = `<div class="chips ${q.type}">${q.options.map(o => `<button type="button" class="chip ${sel.includes(o) ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
    if (q.type === 'multi') input += '<p class="muted small">Du kannst mehrere wählen.</p>';
  }

  setView(`
    <section class="onb">
      <div class="onb-top">
        <div class="brand">${logo()}<span>LernPilot</span></div>
        <span class="muted">Frage ${qIndex + 1} von ${QUESTIONS.length}</span>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="bubble bot big-q">${esc(q.q)}</div>
      <div class="onb-input">${input}</div>
      <div class="row gap onb-actions">
        <button class="btn ghost" id="qBack" ${qIndex === 0 ? 'disabled' : ''}>${icon('back')} Zurück</button>
        ${q.optional ? '<button class="btn ghost" id="qSkip">Überspringen</button>' : ''}
        <button class="btn primary grow" id="qNext">Weiter</button>
      </div>
    </section>`);

  const next = () => {
    let v;
    if (q.type === 'text' || q.type === 'number') v = $('#qInput').value.trim();
    else {
      v = $$('.chip.on').map(b => b.dataset.v);
      if (q.type === 'single') v = v[0] || '';
    }
    const empty = Array.isArray(v) ? !v.length : !v;
    if (empty && !q.optional) { toast('Bitte antworte kurz. 🙂'); return; }
    answers[q.id] = v;
    save('profile');
    qIndex++;
    viewOnboarding();
  };

  $$('.chip').forEach(b => b.onclick = () => {
    if (q.type === 'single') {
      $$('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      setTimeout(next, 180);
    } else b.classList.toggle('on');
  });
  $('#qInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') next(); });
  $('#qInput')?.focus();
  $('#qNext').onclick = next;
  $('#qBack').onclick = () => { qIndex = Math.max(0, qIndex - 1); viewOnboarding(); };
  if ($('#qSkip')) $('#qSkip').onclick = () => { answers[q.id] = ''; save('profile'); qIndex++; viewOnboarding(); };
}

function renderIntro() {
  setView(`
    <section class="onb intro">
      <div class="hero-logo">${logo()}</div>
      <h1>Willkommen bei <span class="grad">LernPilot</span></h1>
      <p class="lead">Dein persönlicher Lern-Coach: Chat, Audio-Lektionen, Quizze, Lernkarten und Lernplan. Alles an einem Ort.</p>
      <div class="feature-list">
        <div>${icon('chat')}<span>Chatbot, der dich kennt</span></div>
        <div>${icon('headphones')}<span>Audio mit Denk-Pausen</span></div>
        <div>${icon('quiz')}<span>Quizze zu jedem Thema</span></div>
        <div>${icon('cards')}<span>Lernkarten aus Fotos</span></div>
        <div>${icon('plan')}<span>Lernplan für dein Bundesland</span></div>
      </div>
      <p>Zuerst stelle ich dir <strong>${QUESTIONS.length} kurze Fragen</strong>. So passt alles genau zu dir. Das dauert ungefähr 5 Minuten.</p>
      <button class="btn primary xl" id="go">Los geht's</button>
      <p class="muted small">Deine Daten bleiben nur auf deinem Gerät.</p>
    </section>`);
  $('#go').onclick = () => { state.profile.answers._started = true; save('profile'); viewOnboarding(); };
}

function renderOnboardingDone() {
  const name = state.profile.answers.name || '';
  setView(`
    <section class="onb intro">
      <div class="hero-logo big-emoji">🎉</div>
      <h1>Super, ${esc(name)}!</h1>
      <p class="lead">Jetzt kenne ich dich. Ich passe alles an deine Klasse, dein Bundesland und deinen Lernstil an.</p>
      <p>Letzter Schritt: Die KI braucht einen <strong>kostenlosen Schlüssel</strong> von Google.</p>
      <button class="btn primary xl" id="finish">Weiter</button>
    </section>`);
  $('#finish').onclick = async () => {
    state.profile.done = true;
    await saveNow('profile');
    location.hash = aiReady() ? '#/start' : '#/einrichten';
  };
}

// ---------------- KI-Schlüssel einrichten ----------------
function viewKeySetup() {
  setView(`
    <section class="page narrow">
      <h1>KI einrichten</h1>
      <p class="lead">Damit der Chatbot antworten kann, brauchst du einen <strong>Schlüssel</strong> (ein geheimes Passwort für die KI). Bei Google ist er <strong>kostenlos</strong>.</p>
      <div class="card steps">
        <h3>So bekommst du den Schlüssel (2 Minuten):</h3>
        <ol>
          <li>Öffne <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener"><strong>aistudio.google.com/apikey</strong></a></li>
          <li>Melde dich mit deinem <strong>Google-Konto</strong> an.</li>
          <li>Tippe auf <strong>„API-Schlüssel erstellen“</strong> (Create API key).</li>
          <li><strong>Kopiere</strong> den Schlüssel. Er beginnt meistens mit <code>AIza…</code></li>
          <li>Füge ihn hier unten ein.</li>
        </ol>
      </div>
      <label class="label" for="key">Dein Gemini-Schlüssel</label>
      <input class="input big" id="key" type="password" placeholder="AIza…" value="${esc(state.settings.geminiKey)}" autocomplete="off">
      <div class="row gap mt">
        <button class="btn primary grow" id="saveKey">Speichern und testen</button>
      </div>
      <p class="muted small mt">Der Schlüssel bleibt nur auf deinem Gerät. Gib ihn niemandem.</p>
      <p class="mt"><a href="#/start" class="muted">Später machen</a></p>
    </section>`);
  $('#saveKey').onclick = async () => {
    const key = $('#key').value.trim();
    if (!key) { toast('Bitte den Schlüssel einfügen.'); return; }
    const btn = $('#saveKey');
    btn.disabled = true;
    btn.textContent = 'Teste …';
    try {
      const model = await findBestGeminiModel(key);
      state.settings.geminiKey = key;
      state.settings.geminiModel = model;
      state.settings.provider = 'gemini';
      await saveNow('settings');
      toast('Alles bereit! ✅', 'ok');
      location.hash = '#/start';
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Speichern und testen';
    }
  };
}

// ---------------- Start ----------------
function viewStart() {
  const a = state.profile.answers;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend';
  const due = state.decks.reduce((n, d) => n + dueCards(d).length, 0);
  const s = streak();
  const planItems = [];
  if (state.plan) {
    for (const w of state.plan.weeks) for (const it of w.items) if (!it.done && planItems.length < 4) planItems.push(it);
  }
  const recent = [...state.lessons].reverse().slice(0, 4);

  setView(`
    <section class="page">
      <header class="start-head">
        <div>
          <p class="muted">${greet},</p>
          <h1>${esc(a.name || 'Schüler')} 👋</h1>
        </div>
        <div class="streak" title="Tage hintereinander gelernt">${icon('flame')}<b>${s}</b><span>${s === 1 ? 'Tag' : 'Tage'}</span></div>
      </header>

      ${aiReady() ? '' : `<a class="card warn" href="#/einrichten">⚠️ Die KI ist noch nicht eingerichtet. <strong>Hier tippen</strong>, um den kostenlosen Schlüssel einzutragen.</a>`}

      <form class="ask" id="askForm">
        ${icon('sparkle')}
        <input id="askInput" class="input" placeholder="Frag mich etwas …" autocomplete="off">
        <button class="btn primary icon-btn" aria-label="Senden">${icon('send')}</button>
      </form>

      <div class="tiles">
        <a class="tile t1" href="#/lernen?art=vorbereitung">${icon('book')}<b>Unterricht vorbereiten</b><span>Was kommt morgen dran?</span></a>
        <a class="tile t2" href="#/lernen?art=vorlesung">${icon('headphones')}<b>Audio-Vorlesung</b><span>Anhören mit Denk-Pausen</span></a>
        <a class="tile t3" href="#/lernen?art=zusammenfassung">${icon('brain')}<b>Zusammenfassung</b><span>Das Wichtigste kurz</span></a>
        <a class="tile t4" href="#/quiz">${icon('quiz')}<b>Quiz</b><span>Teste dein Wissen</span></a>
        <a class="tile t5" href="#/karten">${icon('cards')}<b>Lernkarten</b><span>${due ? `${due} Karten fällig` : 'Vokabeln & Begriffe'}</span></a>
        <a class="tile t6" href="#/plan">${icon('plan')}<b>Lernplan</b><span>Themen & Wochenplan</span></a>
      </div>

      ${planItems.length ? `
      <h2 class="section-title">Als Nächstes im Lernplan</h2>
      <div class="card list">
        ${planItems.map(it => `<label class="check-row"><input type="checkbox" data-id="${it.id}"><span><b>${esc(it.subject || '')}</b> ${esc(it.task)}</span></label>`).join('')}
      </div>` : ''}

      ${recent.length ? `
      <h2 class="section-title">Zuletzt gelernt</h2>
      <div class="grid-list">
        ${recent.map(l => `<a class="card mini" href="#/lernen/${l.id}"><span class="tag">${esc(l.kindLabel)}</span><b>${esc(l.title)}</b><span class="muted small">${esc(l.subject)} · ${fmtDate(l.created)}</span></a>`).join('')}
      </div>` : ''}
    </section>`);

  $('#askForm').onsubmit = e => {
    e.preventDefault();
    const t = $('#askInput').value.trim();
    if (!t) return;
    pendingQuestion = t;
    location.hash = '#/chat/neu';
  };
  $$('.check-row input').forEach(cb => cb.onchange = () => {
    for (const w of state.plan.weeks) for (const it of w.items) if (it.id === cb.dataset.id) it.done = cb.checked;
    save('plan');
    toast('Super gemacht! 💪', 'ok');
    setTimeout(viewStart, 500);
  });
}

// ---------------- Chat ----------------
let pendingQuestion = null;
export function askInChat(text) {
  pendingQuestion = text;
  location.hash = '#/chat/neu';
}

function viewChat(id) {
  if (id === 'neu' || (!id && !state.chats.length)) {
    const chat = { id: uid(), title: 'Neuer Chat', created: new Date().toISOString(), messages: [] };
    state.chats.push(chat);
    save('chats');
    history.replaceState(null, '', `#/chat/${chat.id}`);
    id = chat.id;
  }
  if (!id) id = state.chats[state.chats.length - 1].id;
  const chat = state.chats.find(c => c.id === id);
  if (!chat) { location.hash = '#/chat'; return; }

  let images = [];
  let controller = null;
  let recog = null;

  setView(`
    <section class="chat-page">
      <aside class="chat-list" id="chatList"></aside>
      <div class="chat-main">
        <div class="chat-head">
          <button class="btn ghost icon-btn only-mobile" id="toggleList" aria-label="Chats">${icon('menu')}</button>
          <h2 class="chat-title">${esc(chat.title)}</h2>
          <a class="btn ghost small-btn" href="#/chat/neu">${icon('plus')} Neu</a>
        </div>
        <div class="messages" id="msgs"></div>
        <div class="previews" id="previews"></div>
        <form class="composer" id="composer">
          <button type="button" class="btn ghost icon-btn" id="attach" aria-label="Foto anhängen">${icon('camera')}</button>
          <textarea id="msgInput" rows="1" placeholder="Deine Frage …"></textarea>
          ${('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) ? `<button type="button" class="btn ghost icon-btn" id="mic" aria-label="Sprechen">${icon('mic')}</button>` : ''}
          <button class="btn primary icon-btn" id="sendBtn" aria-label="Senden">${icon('send')}</button>
        </form>
      </div>
    </section>`);

  const msgsEl = $('#msgs');
  const input = $('#msgInput');

  function renderList() {
    $('#chatList').innerHTML = `
      <a class="btn primary full" href="#/chat/neu">${icon('plus')} Neuer Chat</a>
      ${[...state.chats].reverse().map(c => `
        <div class="chat-link ${c.id === chat.id ? 'active' : ''}">
          <a href="#/chat/${c.id}">${esc(c.title)}</a>
          <button class="del" data-id="${c.id}" aria-label="Löschen">${icon('trash')}</button>
        </div>`).join('')}`;
    $$('#chatList .del').forEach(b => b.onclick = () => {
      if (!confirm('Diesen Chat löschen?')) return;
      state.chats = state.chats.filter(c => c.id !== b.dataset.id);
      save('chats');
      location.hash = b.dataset.id === chat.id ? '#/chat' : location.hash;
      renderList();
    });
  }

  function msgHTML(m, i) {
    if (m.role === 'user') {
      return `<div class="msg user"><div class="bubble">${m.imageCount ? `<span class="tag">📷 ${m.imageCount} Foto${m.imageCount > 1 ? 's' : ''}</span>` : ''}${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
    }
    return `<div class="msg bot"><div class="bubble md">${md(m.text)}</div>
      <div class="msg-tools">
        <button data-act="speak" data-i="${i}">${icon('speaker')} Vorlesen</button>
        <button data-act="copy" data-i="${i}">${icon('copy')} Kopieren</button>
        <button data-act="simpler" data-i="${i}">Einfacher erklären</button>
      </div></div>`;
  }

  function renderMsgs() {
    if (!chat.messages.length) {
      const n = state.profile.answers.name || '';
      msgsEl.innerHTML = `<div class="empty-chat">
        <div class="hero-logo">${logo()}</div>
        <h3>Hallo ${esc(n)}! Wie kann ich helfen?</h3>
        <div class="suggest">
          ${['Erkläre mir ein Thema aus Mathe', 'Hilf mir bei meinen Hausaufgaben (Foto)', 'Übe mit mir Französisch', 'Was sollte ich heute lernen?'].map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}
        </div></div>`;
      $$('.suggest .chip').forEach(b => b.onclick = () => { input.value = b.dataset.s; input.focus(); });
      return;
    }
    msgsEl.innerHTML = chat.messages.map(msgHTML).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  msgsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const m = chat.messages[+b.dataset.i];
    if (b.dataset.act === 'speak') speak(m.text);
    if (b.dataset.act === 'copy') navigator.clipboard?.writeText(m.text).then(() => toast('Kopiert'));
    if (b.dataset.act === 'simpler') send('Ich verstehe das noch nicht ganz. Bitte erkläre es noch einmal einfacher, mit anderen Worten und einem Beispiel. Frag mich danach, welcher Teil schwer war.');
  });

  function renderPreviews() {
    $('#previews').innerHTML = images.map((im, i) => `<div class="pv"><img src="${im.preview}" alt=""><button data-i="${i}" aria-label="Entfernen">${icon('x')}</button></div>`).join('');
    $$('#previews button').forEach(b => b.onclick = () => { images.splice(+b.dataset.i, 1); renderPreviews(); });
  }

  async function send(text) {
    text = (text ?? input.value).trim();
    if (!text && !images.length) return;
    if (controller) return;
    if (!aiReady()) { toast('Bitte zuerst die KI einrichten.', 'error'); location.hash = '#/einrichten'; return; }
    const sentImages = images;
    images = [];
    renderPreviews();
    input.value = '';
    autoSize();
    chat.messages.push({ role: 'user', text: text || 'Was siehst du auf dem Bild? Erkläre es mir.', imageCount: sentImages.length, time: new Date().toISOString() });
    if (chat.title === 'Neuer Chat') chat.title = text.slice(0, 48) || 'Foto-Frage';
    $('.chat-title').textContent = chat.title;
    const botMsg = { role: 'assistant', text: '', time: new Date().toISOString() };
    chat.messages.push(botMsg);
    renderMsgs();
    renderList();
    const bubble = msgsEl.lastElementChild.querySelector('.bubble');
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    setSending(true);

    // Letzte Nachrichten mitschicken, damit der Chat den Zusammenhang kennt.
    const hist = chat.messages.slice(0, -1).slice(-30).map((m, i, arr) => ({
      role: m.role,
      text: m.text,
      images: i === arr.length - 1 ? sentImages : [],
    }));
    controller = new AbortController();
    let frame = 0;
    try {
      const full = await streamChat({
        system: systemPrompt(),
        messages: hist,
        signal: controller.signal,
        onText: t => {
          botMsg.text = t;
          if (!frame) frame = requestAnimationFrame(() => {
            frame = 0;
            bubble.innerHTML = md(t.replace(/\[MERKEN:[^\]]*\]?/gi, ''));
            const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 160;
            if (nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
          });
        },
      });
      botMsg.text = extractMemory(full) || '(Keine Antwort)';
    } catch (e) {
      if (e.name === 'AbortError' || /abort/i.test(e.message)) {
        botMsg.text = (botMsg.text ? extractMemory(botMsg.text) + '\n\n' : '') + '_(gestoppt)_';
      } else {
        botMsg.text = `⚠️ ${e.message}`;
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      controller = null;
      setSending(false);
      save('chats');
      renderMsgs();
    }
  }

  function setSending(on) {
    const b = $('#sendBtn');
    if (!b) return;
    b.innerHTML = on ? icon('stop') : icon('send');
    b.classList.toggle('danger', on);
    b.setAttribute('aria-label', on ? 'Stoppen' : 'Senden');
  }

  function autoSize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  }

  $('#composer').onsubmit = e => {
    e.preventDefault();
    if (controller) { controller.abort(); return; }
    send();
  };
  input.addEventListener('input', autoSize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); }
  });
  $('#attach').onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try { images.push(await fileToImage(f)); renderPreviews(); } catch (err) { toast(err.message, 'error'); }
  };
  $('#toggleList')?.addEventListener('click', () => $('#chatList').classList.toggle('open'));
  $('#mic')?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (recog) { recog.stop(); return; }
    recog = new SR();
    recog.lang = 'de-DE';
    recog.interimResults = true;
    const start = input.value;
    $('#mic').classList.add('rec');
    recog.onresult = ev => {
      input.value = (start ? start + ' ' : '') + [...ev.results].map(r => r[0].transcript).join('');
      autoSize();
    };
    recog.onend = () => { recog = null; $('#mic')?.classList.remove('rec'); };
    recog.start();
  });

  renderList();
  renderMsgs();
  if (pendingQuestion) {
    const q = pendingQuestion;
    pendingQuestion = null;
    send(q);
  } else if (!matchMedia('(pointer: coarse)').matches) input.focus();

  return () => { controller?.abort(); recog?.stop(); };
}

// ---------------- Einstellungen ----------------
function viewSettings() {
  const s = state.settings;
  setView(`
    <section class="page narrow">
      <h1>Einstellungen</h1>

      <div class="card">
        <h2>🤖 KI</h2>
        <label class="label">Welche KI?</label>
        <div class="seg" id="prov">
          <button data-v="gemini" class="${s.provider === 'gemini' ? 'on' : ''}">Google Gemini<br><small>kostenlos</small></button>
          <button data-v="claude" class="${s.provider === 'claude' ? 'on' : ''}">Claude<br><small>kostet Geld, sehr gut</small></button>
        </div>
        <div id="provFields"></div>
      </div>

      <div class="card">
        <h2>🔊 Stimme & Audio</h2>
        ${ttsSupported() ? `
        <label class="label" for="voice">Stimme (Deutsch)</label>
        <div class="row gap"><select class="input grow" id="voice"><option>Lade Stimmen …</option></select><button class="btn ghost" id="testVoice">${icon('speaker')} Test</button></div>
        <p class="muted small">Die Stimmen kommen von deinem Gerät. Am natürlichsten klingen Stimmen mit „Natural“, „Online“, „Google“ oder „Premium“ im Namen. Tipp: In Microsoft Edge gibt es sehr gute Stimmen.</p>
        <label class="label">Geschwindigkeit: <b id="rateVal">${s.rate.toFixed(2)}×</b></label>
        <input type="range" id="rate" min="0.5" max="2" step="0.05" value="${s.rate}">
        <label class="label">Denk-Pause zwischen Abschnitten: <b id="pauseVal">${s.pauseMin}–${s.pauseMax} Sek.</b></label>
        <div class="row gap"><span class="muted">von</span><input type="number" class="input num" id="pMin" min="0" max="120" value="${s.pauseMin}"><span class="muted">bis</span><input type="number" class="input num" id="pMax" min="0" max="120" value="${s.pauseMax}"><span class="muted">Sekunden</span></div>
        <p class="muted small">In der Pause hat dein Gehirn Zeit, die Information zu speichern. 0 = keine Pause.</p>
        ` : '<p>Dein Browser kann leider nicht vorlesen.</p>'}
      </div>

      <div class="card">
        <h2>🎨 Aussehen</h2>
        <div class="seg" id="theme">
          ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button data-v="${v}" class="${s.theme === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>👤 Mein Profil</h2>
        <p>Name: <b>${esc(state.profile.answers.name || '')}</b> · Klasse ${esc(state.profile.answers.klasse || '?')} · ${esc(state.profile.answers.bundesland || '')}</p>
        <button class="btn ghost" id="redo">Fragebogen neu ausfüllen</button>
      </div>

      <div class="card">
        <h2>🧠 Was die KI sich gemerkt hat</h2>
        <div id="memList"></div>
        <form class="row gap mt" id="memForm"><input class="input grow" id="memInput" placeholder="Etwas hinzufügen, z. B. „Mathe-Arbeit am 20.10.“"><button class="btn ghost">${icon('plus')}</button></form>
      </div>

      <div class="card">
        <h2>💾 Daten</h2>
        <p class="muted small">Alles ist auf diesem Gerät gespeichert. Mit einer Sicherung kannst du deine Daten auf ein anderes Gerät bringen.</p>
        <div class="row gap wrap">
          <button class="btn ghost" id="exp">Sicherung herunterladen</button>
          <button class="btn ghost" id="imp">Sicherung laden</button>
          <button class="btn danger-outline" id="reset">Alles löschen</button>
        </div>
      </div>
      <p class="muted small center">LernPilot · funktioniert auch offline (außer der KI)</p>
    </section>`);

  function renderProv() {
    const p = state.settings.provider;
    $('#provFields').innerHTML = p === 'gemini' ? `
      <label class="label" for="gKey">Gemini-Schlüssel</label>
      <input class="input" id="gKey" type="password" value="${esc(s.geminiKey)}" placeholder="AIza…" autocomplete="off">
      <p class="muted small">Kostenlos bei <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></p>
      <label class="label" for="gModel">Modell</label>
      <div class="row gap"><input class="input grow" id="gModel" value="${esc(s.geminiModel)}"><button class="btn ghost" id="best">Bestes Modell suchen</button></div>
    ` : `
      <label class="label" for="cKey">Claude-Schlüssel</label>
      <input class="input" id="cKey" type="password" value="${esc(s.claudeKey)}" placeholder="sk-ant-…" autocomplete="off">
      <p class="muted small">Von <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Hier bezahlst du pro Nutzung.</p>
      <label class="label" for="cModel">Modell</label>
      <input class="input" id="cModel" value="${esc(s.claudeModel)}">
    `;
    const bind = (sel, key) => { const el = $(sel); if (el) el.onchange = () => { state.settings[key] = el.value.trim(); save('settings'); toast('Gespeichert'); }; };
    bind('#gKey', 'geminiKey'); bind('#gModel', 'geminiModel'); bind('#cKey', 'claudeKey'); bind('#cModel', 'claudeModel');
    $('#best')?.addEventListener('click', async () => {
      const key = $('#gKey').value.trim();
      if (!key) { toast('Zuerst den Schlüssel eintragen.'); return; }
      try {
        const m = await findBestGeminiModel(key);
        state.settings.geminiKey = key;
        state.settings.geminiModel = m;
        save('settings');
        $('#gModel').value = m;
        toast(`Modell: ${m} ✅`, 'ok');
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  renderProv();
  $$('#prov button').forEach(b => b.onclick = () => {
    $$('#prov button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    state.settings.provider = b.dataset.v;
    save('settings');
    renderProv();
  });

  if (ttsSupported()) {
    voicesFor('de').then(list => {
      const sel = $('#voice');
      if (!sel) return;
      sel.innerHTML = list.length
        ? list.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
        : '<option value="">Keine deutsche Stimme gefunden</option>';
      sel.onchange = () => { state.settings.voiceURI = sel.value; save('settings'); };
    });
    $('#testVoice').onclick = () => speak(`Hallo ${state.profile.answers.name || ''}! So klinge ich. Viel Erfolg beim Lernen.`);
    $('#rate').oninput = e => { state.settings.rate = +e.target.value; $('#rateVal').textContent = `${state.settings.rate.toFixed(2)}×`; save('settings'); };
    const pauses = () => {
      let a = Math.max(0, +$('#pMin').value || 0);
      let b = Math.max(0, +$('#pMax').value || 0);
      if (b < a) b = a;
      state.settings.pauseMin = a;
      state.settings.pauseMax = b;
      $('#pauseVal').textContent = `${a}–${b} Sek.`;
      save('settings');
    };
    $('#pMin').onchange = pauses;
    $('#pMax').onchange = pauses;
  }

  $$('#theme button').forEach(b => b.onclick = () => {
    $$('#theme button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    state.settings.theme = b.dataset.v;
    save('settings');
    applyTheme();
  });

  $('#redo').onclick = () => {
    state.profile.done = false;
    qIndex = 0;
    save('profile');
    location.hash = '#/willkommen';
  };

  function renderMem() {
    $('#memList').innerHTML = state.memory.length
      ? state.memory.map(m => `<div class="mem-row"><span>${esc(m.text)}</span><button data-id="${m.id}" aria-label="Löschen">${icon('trash')}</button></div>`).join('')
      : '<p class="muted">Noch nichts. Die KI merkt sich wichtige Dinge aus dem Chat automatisch.</p>';
    $$('#memList button').forEach(b => b.onclick = () => { state.memory = state.memory.filter(m => m.id !== b.dataset.id); save('memory'); renderMem(); });
  }
  renderMem();
  $('#memForm').onsubmit = e => {
    e.preventDefault();
    const t = $('#memInput').value.trim();
    if (!t) return;
    state.memory.push({ id: uid(), text: t, date: new Date().toISOString() });
    save('memory');
    $('#memInput').value = '';
    renderMem();
  };

  $('#exp').onclick = () => download(`lernpilot-sicherung-${new Date().toISOString().slice(0, 10)}.json`, exportAll());
  $('#imp').onclick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try { await importAll(await f.text()); toast('Sicherung geladen ✅', 'ok'); applyTheme(); route(); } catch (e) { toast(e.message, 'error'); }
  };
  $('#reset').onclick = async () => {
    if (!confirm('Wirklich ALLES löschen? Chats, Karten, Quizze, Profil … Das kann man nicht rückgängig machen.')) return;
    await resetAll();
    qIndex = 0;
    location.hash = '#/willkommen';
    route();
  };
}

// ---------------- Start der App ----------------
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

async function init() {
  await loadState();
  applyTheme();
  window.addEventListener('hashchange', route);
  // Beim Drucken alle aufklappbaren Teile öffnen (z. B. Lösungen).
  window.addEventListener('beforeprint', () => $$('details').forEach(d => { d.open = true; }));
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
