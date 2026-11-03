/* Awen (Counter Talk) client: one state object, string templates, and event delegation through data-act. */
(function () {
  'use strict';

  /* ---------------- utilities ---------------- */
  const $stage = document.getElementById('stage');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
  const unquote = s => String(s || '').trim().replace(/^[“"]+|[”"]+$/g, '');
  const LEVELS = [['I know some words, but speaking is hard', 'Beginner'], ['I can manage simple conversations', 'Lower-intermediate'], ['I speak often but want to sound natural', 'Intermediate']];
  const GOALS = [['food', 'Ordering food'], ['shop', 'Shopping'], ['dir', 'Asking directions'], ['hotel', 'Hotel check-in'], ['friend', 'Chatting with a friend']];
  const TIMES = [5, 10, 15];
  const HINT_STYLES = [['steps', 'Step by step', 'A small nudge first. More help only if I ask.'], ['full', 'Full answer', 'Show me the whole sentence right away.']];
  const STATUS_CLASS = { Strong: 'strong', 'Getting there': 'getting', 'Practice next': 'next' };

  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body instanceof Blob) { init.body = opts.body; init.headers['Content-Type'] = opts.body.type || 'application/octet-stream'; }
    else if (opts.body !== undefined) { init.body = JSON.stringify(Object.assign({ today: today() }, opts.body)); init.headers['Content-Type'] = 'application/json'; }
    let res;
    try { res = await fetch(path, init); } catch (e) { throw new Error('Can’t reach the Awen server. Check your connection.'); }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong (' + res.status + ').'); err.status = res.status; throw err; }
    return data;
  }

  /* ---------------- icons ---------------- */
  const svg = (d, size, stroke, extra) => '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="' + (stroke || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
  const I = {
    back: s => svg('<path d="M15 18l-6-6 6-6"/>', s || 20, '#14302C'),
    close: s => svg('<path d="M6 6l12 12M18 6 6 18"/>', s || 20, '#14302C'),
    check: (s, c) => svg('<path d="M20 6 9 17l-5-5"/>', s || 16, c || '#9BE3B8', ' stroke-width="2.5"'),
    speaker: s => svg('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7"/>', s || 16),
    bulb: (s, c) => svg('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>', s || 22, c || '#A4541A'),
    mic: s => svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>', s || 32, '#FFFFFF'),
    keys: s => svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', s || 22, '#556A65'),
    book: (s, c) => svg('<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h5"/>', s || 28, c || '#0F5C52', ' stroke-width="1.8"'),
    flame: on => '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (on ? '#F2B632' : 'none') + '" stroke="#A4541A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z"/></svg>',
    lock: s => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', s || 22, '#F2B632'),
    chev: s => svg('<path d="M9 6l6 6-6 6"/>', s || 18, '#556A65')
  };

  /* ---------------- state ---------------- */
  const S = {
    screen: 'boot', me: null, ai: { ready: true },
    onboard: { name: '', pin: '', level: 0, goals: { food: true }, time: 0, error: '', busy: false, edit: false },
    login: { name: '', pin: '', error: '', busy: false },
    brief: null, briefId: null, talk: null, report: null, drill: null, reportFrom: 'talk', nbTab: 0, toast: '', busy: false
  };
  const st = () => S.me || {};
  const activePath = () => { const me = st(); return (me.paths || []).find(p => p.id === me.user.activePath) || (me.paths || [])[0]; };
  const nextMission = path => path && path.missions.find(m => m.status === 'today');
  const missionById = id => { for (const p of st().paths || []) for (const m of p.missions) if (m.id === id) return m; return null; };

  /* ---------------- speech out ---------------- */
  let voice = null;
  function pickVoice() {
    try {
      const vs = window.speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
      voice = vs.find(v => /en-US/i.test(v.lang) && /Samantha|Google US|Jenny|Aria|Natural/i.test(v.name)) || vs.find(v => /en-US/i.test(v.lang)) || vs[0] || null;
    } catch (e) {}
  }
  try { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {}
  function say(text, rate) {
    try {
      const u = new SpeechSynthesisUtterance(String(text).replace(/[“”]/g, '').replace(/___/g, 'blank'));
      u.lang = 'en-US'; if (voice) u.voice = voice;
      const lvl = S.me ? S.me.user.level : 1;
      u.rate = rate || (S.talk && S.talk.slow ? 0.72 : lvl === 0 ? 0.9 : 1);
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ---------------- navigation & render ---------------- */
  function go(screen, extra) {
    if (S.screen === 'talk' && screen !== 'talk') leaveTalk();
    if (S.screen === 'feedback') { stopRecording(true); S.drill = null; }
    Object.assign(S, extra || {});
    S.screen = screen;
    render(true);
  }
  let toastTimer = null;
  function toast(msg) { S.toast = msg; render(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = ''; render(); }, 6000); }

  function render(newScreen) {
    const scrolls = newScreen ? [] : Array.from($stage.querySelectorAll('[data-scroll]')).map(el => ({ k: el.dataset.scroll, top: el.scrollTop, h: el.scrollHeight, atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 30 }));
    const act = document.activeElement;
    const focusId = act && act.id && $stage.contains(act) ? act.id : null;
    const sel = focusId && act.setSelectionRange ? [act.selectionStart, act.selectionEnd] : null;
    const view = VIEWS[S.screen] || VIEWS.boot;
    $stage.innerHTML = view() + (S.toast ? '<div class="toast" role="alert"><span>' + esc(S.toast) + '</span><button data-act="closeToast">OK</button></div>' : '');
    $stage.querySelectorAll('[data-scroll]').forEach(el => {
      const b = scrolls.find(x => x.k === el.dataset.scroll);
      if (el.dataset.stick === '1') { if (!b || b.atBottom || el.scrollHeight > b.h) el.scrollTop = el.scrollHeight; else el.scrollTop = b.top; }
      else if (b) el.scrollTop = b.top;
    });
    if (focusId) { const f = document.getElementById(focusId); if (f) { f.focus(); if (sel) try { f.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
    const auto = $stage.querySelector('[data-autofocus]');
    if (auto && (document.activeElement === document.body || !document.activeElement)) auto.focus();
  }

  /* ---------------- shared pieces ---------------- */
  const nav = cur => '<nav class="nav" aria-label="Main">' + [['home', 'Missions'], ['notebook', 'Notebook'], ['progress', 'Progress']]
    .map(t => '<button data-act="go" data-to="' + t[0] + '" class="' + (cur === t[0] ? 'on' : '') + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</button>').join('') + '</nav>';
  const backBtn = (act, label, icon) => '<button type="button" class="icon-btn" data-act="' + act + '" aria-label="' + esc(label) + '">' + (icon === 'close' ? I.close() : I.back()) + '</button>';
  const pill = status => '<span class="pill ' + (STATUS_CLASS[status] || 'getting') + '">' + esc(status) + '</span>';
  const avatar = (c, cls) => '<div class="avatar ' + (cls || '') + '" aria-hidden="true">' + esc(c.initials || c.name.slice(0, 2)) + '</div>';
  const hearBtn = (text, label, cls) => '<button class="hear ' + (cls || '') + '" data-act="say" data-text="' + esc(text) + '" aria-label="' + esc(label || 'Hear this phrase') + '">' + I.speaker(cls ? 14 : 16) + '</button>';
  const aiBanner = () => S.ai && !S.ai.ready ? '<div class="banner"><b>AI is not connected.</b> Add your GROQ_API_KEY to the server’s .env file and restart it. Conversations need it.</div>' : '';

  /* ================= VIEWS ================= */
  const VIEWS = {};
  VIEWS.boot = () => '<div class="boot">Loading…</div>';

  /* ---------- welcome ---------- */
  VIEWS.welcome = () => '<div class="screen welcome">' +
    '<div class="logo col gap-6"><span class="logo-name">Awen</span><span class="logo-sub">Counter Talk</span></div>' +
    '<div class="col demo-chat">' +
      '<div class="row gap-10" style="align-items:flex-end"><div class="avatar">Jo</div><div class="bubble-in">Hi there! What can I get for you?</div></div>' +
      '<div class="row" style="justify-content:flex-end"><div class="bubble-out">I’d like a coffee, please.</div></div>' +
      '<div class="row gap-8" style="font-family:var(--mono);font-size:12px;color:var(--teal-text);letter-spacing:.06em">' + I.check(16) + 'JO UNDERSTOOD YOU</div>' +
    '</div>' +
    '<div class="col gap-12 grow"><h1 class="h-xl">Speak English in real moments.</h1><p class="t17" style="line-height:1.5;color:#E3F1EE">Short missions with a friendly character. Help when you get stuck. A notebook that remembers what you learn.</p></div>' +
    '<div class="col gap-12"><button class="btn btn-gold" data-act="startOnboard">Get started</button><button class="btn btn-plain" style="color:#fff" data-act="go" data-to="login">I already have an account</button></div>' +
  '</div>';

  /* ---------- login ---------- */
  VIEWS.login = () => { const L = S.login; return '<form class="screen pad" data-form="login" novalidate>' +
    '<div class="row between">' + backBtn('goWelcome', 'Back') + '<span class="eyebrow">WELCOME BACK</span></div>' +
    '<div class="row gap-10" style="align-items:flex-end">' + avatar({ name: 'Jo', initials: 'Jo' }, 's48') + '<div class="bubble-in" style="border:1px solid var(--line);font-size:16px;padding:12px 14px">Good to see you again! Tell me your name and PIN.</div></div>' +
    '<div class="col gap-8"><label for="login-name" class="h-m">Your name</label>' +
      '<input id="login-name" class="field" data-model="login.name" autocomplete="username" maxlength="24" value="' + esc(L.name) + '" placeholder="Your name" data-autofocus></div>' +
    '<div class="col gap-8"><label for="login-pin" class="h-xs">4-digit PIN</label>' +
      '<input id="login-pin" class="field pin" data-model="login.pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="4" value="' + esc(L.pin) + '" placeholder="••••">' +
      (L.error ? '<span class="err" role="alert">' + esc(L.error) + '</span>' : '') + '</div>' +
    '<div class="grow"></div>' +
    '<button type="submit" class="btn btn-dark" ' + (L.busy ? 'disabled' : '') + '>' + (L.busy ? '<span class="spinner"></span>' : 'Sign in') + '</button>' +
    '<button type="button" class="btn btn-plain" data-act="startOnboard" style="margin-top:-12px">New here? Create an account</button>' +
  '</form>'; };

  /* ---------- onboarding: name ---------- */
  VIEWS.name = () => { const O = S.onboard; return '<form class="screen pad" data-form="name" novalidate>' +
    '<div class="row between">' + backBtn('goWelcome', 'Back') + '<span class="eyebrow">STEP 1 OF 2</span></div>' +
    '<div class="row gap-10" style="align-items:flex-end">' + avatar({ name: 'Jo', initials: 'Jo' }, 's48') + '<div class="bubble-in" style="border:1px solid var(--line);font-size:16px;padding:12px 14px">Hi, I’m Jo! I’ll be your practice partner. What should I call you?</div></div>' +
    '<div class="col gap-8"><label for="learner-name" class="h-m">What’s your name?</label><span class="t14 muted">First name or a nickname is fine.</span>' +
      '<input id="learner-name" class="field" style="margin-top:6px" data-model="onboard.name" autocomplete="given-name" maxlength="24" value="' + esc(O.name) + '" placeholder="Your name" data-autofocus></div>' +
    '<div class="col gap-8"><label for="learner-pin" class="h-xs">Pick a 4-digit PIN</label><span class="t14 muted">You’ll use it to sign in on another device.</span>' +
      '<input id="learner-pin" class="field pin" data-model="onboard.pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" value="' + esc(O.pin) + '" placeholder="••••">' +
      (O.error ? '<span class="err" role="alert">' + esc(O.error) + '</span>' : '') + '</div>' +
    '<div class="grow"></div>' +
    '<button type="submit" class="btn btn-dark">Continue</button>' +
  '</form>'; };

  /* ---------- onboarding: level / preferences ---------- */
  VIEWS.level = () => { const O = S.onboard; return '<div class="screen pad" style="gap:20px">' +
    '<div class="row between">' + backBtn(O.edit ? 'goProgress' : 'backToName', 'Back') + '<span class="eyebrow">' + (O.edit ? 'YOUR PREFERENCES' : 'STEP 2 OF 2') + '</span></div>' +
    '<div class="scroll col gap-20" data-scroll="level" style="gap:20px;margin:0 -4px;padding:0 4px">' +
    '<div class="col gap-6">' + (O.edit ? '' : '<span class="t16 b7" style="color:var(--teal)">Nice to meet you, ' + esc(cap(O.name)) + '!</span>') +
      '<h1 class="h-m">How does speaking English feel right now?</h1></div>' +
    '<div class="col gap-10" role="radiogroup" aria-label="Your level">' + LEVELS.map((l, i) =>
      '<button class="choice ' + (O.level === i ? 'on' : '') + '" role="radio" aria-checked="' + (O.level === i) + '" data-act="pickLevel" data-i="' + i + '"><span class="t16 b7">' + l[0] + '</span><span class="t14 muted">' + l[1] + '</span></button>').join('') + '</div>' +
    '<div class="col gap-10"><h2 class="h-xs">Where do you want to feel confident?</h2><div class="row wrap gap-8">' + GOALS.map(g =>
      '<button class="toggle ' + (O.goals[g[0]] ? 'on' : '') + '" aria-pressed="' + !!O.goals[g[0]] + '" data-act="toggleGoal" data-g="' + g[0] + '">' + g[1] + '</button>').join('') + '</div></div>' +
    '<div class="col gap-10"><h2 class="h-xs">When you get stuck, show me…</h2><div class="grid2" role="radiogroup" aria-label="Hint style">' + HINT_STYLES.map(h =>
      '<button class="choice ' + (O.hintStyle === h[0] ? 'on' : '') + '" role="radio" aria-checked="' + (O.hintStyle === h[0]) + '" data-act="pickHintStyle" data-v="' + h[0] + '"><span class="t15 b7">' + h[1] + '</span><span class="t13 muted">' + h[2] + '</span></button>').join('') + '</div>' +
      '<span class="t12 muted">You can switch any time while you practice.</span></div>' +
    '<div class="col gap-10"><h2 class="h-xs">Daily practice</h2><div class="grid3">' + TIMES.map((t, i) =>
      '<button class="toggle ' + (O.time === i ? 'on' : '') + '" aria-pressed="' + (O.time === i) + '" data-act="pickTime" data-i="' + i + '">' + t + ' min</button>').join('') + '</div></div>' +
    '</div>' +
    (O.error ? '<span class="err" role="alert">' + esc(O.error) + '</span>' : '') +
    '<button class="btn btn-dark" data-act="' + (O.edit ? 'savePrefs' : 'finishOnboard') + '" ' + (O.busy ? 'disabled' : '') + '>' + (O.busy ? '<span class="spinner"></span>' : O.edit ? 'Save changes' : 'Start my first mission') + '</button>' +
  '</div>'; };

  /* ---------- home ---------- */
  VIEWS.home = () => {
    const me = st(), u = me.user, p = activePath(), nm = nextMission(p), s = me.stats;
    const hour = new Date().getHours();
    const greeting = s.practicedToday ? 'Great job today,' : me.history.length ? 'Welcome back,' : hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';
    let hero;
    if (nm) {
      const personal = nm.n > 1 || me.activeGoal;
      hero = '<div class="card-teal col gap-12">' +
        '<span class="eyebrow" style="color:var(--teal-text)">' + (nm.attempts ? 'TRY AGAIN' : personal ? 'UP NEXT · BUILT FROM YOUR NOTEBOOK' : 'TODAY’S MISSION') + ' · ' + esc(p.label.toUpperCase()) + '</span>' +
        '<h2 class="h-s">' + esc(nm.goal.replace(/\.$/, '')) + '</h2>' +
        '<div class="row wrap gap-8"><span class="chip">About ' + nm.minutes + ' min</span>' + nm.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('') +
          (me.activeGoal && nm.n > 1 ? '<span class="chip">Reuses “' + esc(shortGoal(me.activeGoal)) + '”</span>' : '<span class="chip">' + esc(u.levelLabel) + '</span>') + '</div>' +
        '<button class="btn sm btn-gold" style="margin-top:4px" data-act="openBrief" data-id="' + nm.id + '">Start mission ' + nm.n + '</button></div>';
    } else {
      const other = me.otherPaths[0];
      hero = '<div class="col gap-12" style="background:var(--ink);color:#fff;border-radius:20px;padding:20px">' +
        '<div class="row gap-8">' + I.check(20) + '<span class="eyebrow" style="color:var(--teal-text)">PATH COMPLETE</span></div>' +
        '<h2 class="h-s">All ' + p.missions.length + ' missions in ' + esc(p.label.toLowerCase()) + ' are done.</h2>' +
        '<span class="t14" style="color:var(--teal-text)">Replay any mission below to beat your last score' + (other ? ', or add a new path.' : '.') + '</span>' +
        (other ? '<button class="btn sm btn-gold" data-act="addPath" data-id="' + other.id + '">Start “' + esc(other.label) + '”</button>' : '<button class="btn sm btn-gold" data-act="go" data-to="notebook">Review my notebook</button>') + '</div>';
    }
    const pct = Math.min(100, Math.round(100 * s.todayMinutes / s.dailyMinutes));
    const nb = me.notebook.length + (me.activeGoal ? 1 : 0);
    const practiceCount = me.notebook.filter(n => n.kind === 'practice' && n.status !== 'mastered').length;
    return '<div class="screen">' +
      '<div class="scroll col gap-16" data-scroll="home" style="padding:48px 24px 16px">' +
        '<div class="row between"><div class="col gap-2"><span class="t15 muted">' + greeting + '</span><span class="h-m">' + esc(u.name) + '</span></div>' +
          '<div class="streak ' + (s.streak ? 'on' : '') + '">' + I.flame(s.streak > 0) + (s.streak ? plural(s.streak, 'day') + ' streak' : 'Start your streak') + '</div></div>' +
        aiBanner() +
        (me.paths.length > 1 ? '<div class="path-tabs" role="tablist" aria-label="Your paths">' + me.paths.map(x => '<button role="tab" aria-selected="' + (x.id === p.id) + '" class="path-tab ' + (x.id === p.id ? 'on' : '') + '" data-act="setPath" data-id="' + x.id + '">' + esc(x.label) + '</button>').join('') + '</div>' : '') +
        hero +
        '<div class="daily"><div class="row between t13"><span class="b7">Today’s practice</span><span class="muted">' + s.todayMinutes + ' / ' + s.dailyMinutes + ' min' + (pct >= 100 ? ' · done ✓' : '') + '</span></div><div class="bar"><div style="width:' + pct + '%"></div></div></div>' +
        '<div class="col gap-10"><h3 class="h-xs">Your path: ' + esc(p.label) + '</h3><div class="path-list">' + p.missions.map(m => {
          const tag = m.status === 'done' ? 'DONE · REPLAY' : m.status === 'today' ? (m.attempts ? 'TRY AGAIN' : 'TODAY') : m.n === 2 || p.missions[m.n - 2].status === 'today' ? 'AFTER MISSION ' + (m.n - 1) : 'LOCKED';
          return '<button class="path-row ' + m.status + '" ' + (m.status === 'locked' ? 'disabled aria-disabled="true"' : 'data-act="openBrief" data-id="' + m.id + '"') + '>' +
            '<span class="dot ' + m.status + '">' + (m.status === 'done' ? '✓' : m.n) + '</span><span class="grow" style="font-weight:' + (m.status === 'locked' ? 400 : 600) + '">' + esc(m.title) + '</span><span class="path-tag">' + tag + '</span></button>';
        }).join('') + '</div></div>' +
        '<button class="row gap-12 card dashed" data-act="go" data-to="notebook" style="color:var(--ink-2)">' + I.book() +
          '<span class="col gap-2"><span class="t14 b7" style="color:var(--ink)">' + (nb ? 'Notebook · ' + plural(nb, 'item') + (practiceCount ? ', ' + practiceCount + ' to practice' : '') : 'Your notebook is empty') + '</span>' +
          '<span class="t13">' + (me.activeGoal ? 'Active goal: “' + esc(shortGoal(me.activeGoal)) + '” · used ' + (me.activeGoal.uses || 0) + ' of 3' : 'Finish a mission to save your first expression.') + '</span></span></button>' +
      '</div>' + nav('home') + '</div>';
  };
  const shortGoal = g => { const m = String(g.title).match(/[“"]([^”"]+)[”"]/); return m ? m[1] : g.title; };
  const cap = s => String(s || '').trim().charAt(0).toUpperCase() + String(s || '').trim().slice(1);

  /* ---------- brief ---------- */
  VIEWS.brief = () => {
    const b = S.brief;
    if (!b) return '<div class="screen pad-20">' + '<div class="row gap-12">' + backBtn('goHome', 'Close mission', 'close') + '</div><div class="boot">Loading mission…</div></div>';
    const m = b.mission;
    return '<div class="screen pad-20">' +
      '<div class="row gap-12">' + backBtn('goHome', 'Close mission', 'close') + '<span class="eyebrow">MISSION ' + m.n + ' · ' + esc(m.place.toUpperCase()) + '</span></div>' +
      '<div class="scroll col gap-16" data-scroll="brief" style="margin:0 -4px;padding:0 4px">' +
        '<div class="row gap-14 card" style="border-radius:18px;padding:14px">' + avatar(m.character, 's56') +
          '<div class="col gap-2"><span class="t16 b7">' + esc(m.character.name) + ', the ' + esc(m.character.role) + '</span><span class="t14 muted">' + esc(m.character.desc) + '</span></div></div>' +
        '<div class="col gap-8"><span class="eyebrow">YOUR COMMUNICATION GOAL</span><h1 class="h-s">' + esc(m.goal) + '</h1>' +
          '<div class="' + (m.items.length === 2 ? 'grid2' : 'col gap-8') + '">' + m.items.map((it, i) => '<div class="goal-item"><span class="num">' + (i + 1) + '</span><span class="col"><span class="t14 b7">' + esc(it.label) + '</span><span class="t12 muted">' + esc(it.sub) + '</span></span></div>').join('') + '</div>' +
          '<p class="t14 ink2">' + esc(m.character.name) + ' checks off each part as you say it. Hints come in three steps if you get stuck.' + (m.followUp ? ' New this time: ' + esc(m.followUp) + '.' : '') + '</p></div>' +
        (b.personalized ? '<div class="card col gap-12" style="border-radius:18px;padding:16px"><span class="t16 b7">Built from your notebook</span>' + b.reuse.map(r =>
          '<div class="row gap-10" style="align-items:flex-start"><span class="tag ' + (r.tag === 'NEW' ? '' : 'warn') + '">' + r.tag + '</span><span class="t15">' + esc(r.text) + '</span></div>').join('') + '</div>' : '') +
        (b.lastNote ? '<p class="t15 ink2" style="line-height:1.5">' + esc(b.lastNote) + '</p>' : '') +
        '<div class="card-dark col gap-8"><span class="eyebrow sm" style="color:var(--gold);letter-spacing:.1em">' + esc(m.board.title) + '</span>' +
          m.board.rows.map(r => '<div class="board-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>').join('') + '</div>' +
      '</div>' +
      aiBanner() +
      '<button class="btn btn-gold" data-act="startTalk" data-id="' + m.id + '" ' + (S.busy ? 'disabled' : '') + '>' + (S.busy ? '<span class="spinner"></span>' : m.n === 1 && !missionById(m.id)?.attempts ? 'I’m ready, let’s start' : 'Start mission ' + m.n) + '</button>' +
    '</div>';
  };

  /* ---------- talk ---------- */
  VIEWS.talk = () => {
    const T = S.talk, m = T.mission, c = m.character;
    const open = T.phase === 'ready' || T.phase === 'typing';
    const hint = T.hints[Math.max(0, Math.min(2, T.hint - 1))] || { text: '', chips: [] };
    const levelNames = ['Nudge & strategy', 'Key words & starters', 'Full sentence'];
    const doneCount = m.items.filter(i => T.checklist[i.id]).length;
    let log = '';
    if (T.lastHeard && T.phase !== 'result') log += '<div class="heard"><span class="live-dot"></span><span class="grow" style="min-width:0"><b>' + esc(c.name) + ' heard:</b> “' + esc(T.lastHeard) + '”</span><span class="heard-pill ' + (T.lastStatus === 'unclear' ? 'unclear' : '') + '">' + (T.lastStatus === 'unclear' ? esc(c.name) + ' will help' : 'Understood ✓') + '</span></div>';
    T.log.forEach(x => {
      if (x.who === 'coach') log += '<div class="msg coach"><div class="coach-tip">' + I.bulb(18, '#A4541A').replace('aria-hidden', 'style="flex:none;margin-top:2px" aria-hidden') + '<span class="col gap-2"><span class="eyebrow xs" style="color:var(--warn)">COACH TIP</span><span class="t14 lh">' + esc(x.text) + '</span></span></div></div>';
      else log += '<div class="msg ' + (x.who === 'me' ? 'me' : '') + '">' + (x.who === 'jo' ? avatar(c, 's36') : '') +
        '<div class="bubble"><div class="bubble-label"><span>' + (x.who === 'jo' ? esc(c.name.toUpperCase() + ' · ' + c.role.toUpperCase()) : 'YOU') + '</span>' + hearBtn(x.text, x.who === 'jo' ? 'Hear ' + c.name + ' say this' : 'Hear your sentence', 'sm') + '</div><span>' + esc(x.text) + '</span></div></div>' +
        (x.who === 'me' && x.tip ? lineTip(x.tip) : '');
    });
    if (open && T.phase !== 'result') log += '<div class="row gap-8" style="padding-left:46px"><button class="slow-btn ' + (T.slow ? 'on' : '') + '" aria-pressed="' + T.slow + '" data-act="toggleSlow">Slow voice: ' + (T.slow ? 'on' : 'off') + '</button><button class="slow-btn" data-act="replay">Replay</button></div>';
    if (T.phase === 'listening' && T.demo) log += '<div class="col gap-4" style="align-items:flex-end"><div class="live-bubble">' + esc(T.live || '…') + '</div><span class="eyebrow sm">SAMPLE ANSWER</span></div>';
    if (T.phase === 'listening' && !T.demo) log += '<div class="col gap-4" style="align-items:flex-end"><div class="live-bubble" id="rec-bubble">● Recording <span id="rec-time">0:00</span></div><span class="eyebrow sm">SPEAK NOW</span></div>';
    if (T.phase === 'transcribing') log += '<div class="col gap-4" style="align-items:flex-end"><div class="live-bubble"><span class="typing-dots" style="border:0;padding:0;background:none"><span>•</span><span>•</span><span>•</span></span></div><span class="eyebrow sm">' + esc(c.name.toUpperCase()) + ' IS LISTENING</span></div>';
    if (T.phase === 'thinking') log += '<div class="row gap-10">' + avatar(c, 's36') + '<div class="typing-dots"><span>•</span><span>•</span><span>•</span></div></div>';
    if (T.showHints && T.hint > 0 && open) log += '<div class="hints">' +
      '<div class="row between gap-8"><span class="row gap-6 eyebrow sm" style="color:var(--warn);letter-spacing:.06em">' + I.bulb(14) + 'HINT ' + T.hint + ' OF 3 · ' + levelNames[T.hint - 1].toUpperCase() + '</span><button class="t12 muted" style="min-height:32px;padding:0 8px" data-act="dismissHint">Dismiss</button></div>' +
      '<span class="t15 lh">' + esc(hint.text) + '</span>' +
      '<div class="row wrap gap-6">' + hint.chips.map(ch => '<button class="hint-chip" data-act="useChip" data-text="' + esc(ch) + '">“' + esc(ch) + '”</button>').join('') + '</div>' +
      '<span class="t12 muted">Tap a phrase to hear it and add it to your answer.</span>' +
      '<div class="row wrap gap-14">' +
        (T.hint < 3 ? '<button class="link" data-act="moreHint">Need more help? Show level ' + (T.hint + 1) + ' →</button>' : '') +
        (T.hint < 3 ? '<button class="link" style="color:var(--muted)" data-act="fullHint">Show the full sentence</button>' : '') +
        (T.hint === 3 && T.hintStyle === 'full' ? '<button class="link" style="color:var(--muted)" data-act="nudgeHint">Just give me a nudge instead</button>' : '') +
      '</div></div>';
    if (T.phase === 'result' && T.result) log += resultPanel();

    let dock = '';
    if (T.note && open) dock += '<span class="t14 center" style="color:var(--warn)">' + esc(T.note) + '</span>';
    if (T.phase === 'ready') dock += '<div class="col gap-12"><span class="t15 b6 center">' + esc(T.prompt || m.prompt) + '</span>' +
      '<div class="row between">' +
        '<button class="side-btn" style="color:var(--warn)" data-act="toggleHints"><span class="circle" style="background:var(--warn-bg)">' + I.bulb() + '</span>' + (T.hint === 0 ? 'Hint' : T.showHints ? 'Hint ' + T.hint + '/3' : 'Show hint') + '</button>' +
        '<button class="mic" data-act="startMic" aria-label="Start speaking">' + I.mic() + '</button>' +
        '<button class="side-btn" style="color:var(--muted)" data-act="goType"><span class="circle" style="background:var(--bg)">' + I.keys() + '</span>Type</button></div>' +
      (T.suggestions.length ? '<div class="col gap-6"><span class="eyebrow sm center">' + (T.turns === 0 ? 'NO MIC? TRY A SAMPLE ANSWER' : 'SUGGESTED ANSWERS') + '</span><div class="row wrap gap-6" style="justify-content:center">' +
        T.suggestions.map(sg => '<button class="sample" data-act="playDemo" data-text="' + esc(sg) + '">' + esc(sg) + '</button>').join('') + '</div></div>' : '') +
      (T.turns > 0 ? '<div class="row between" style="border-top:1px dotted var(--line);padding-top:8px"><span class="t12 muted">' + (T.hintsUsed ? plural(T.hintsUsed, 'hint') + ' used' : 'No hints used yet') + '</span><button class="small-btn" data-act="endTalk">End &amp; review</button></div>' : '') + '</div>';
    if (T.phase === 'listening') dock += '<div class="col gap-14" style="align-items:center"><div class="waves ' + (T.demo ? '' : 'live') + '" id="waves" aria-hidden="true">' +
      [0, .15, .3, .1, .45, .25, .05].map(d => '<span class="ctbar" style="animation-delay:' + d + 's"></span>').join('') + '</div>' +
      '<span class="t15 b6">' + (T.demo ? 'Playing sample answer… tap to finish' : 'Listening… tap when you’re done') + '</span>' +
      '<button class="mic" data-act="stopMic" aria-label="Finish speaking"><span class="stop"></span></button></div>';
    if (T.phase === 'typing') dock += '<form class="col gap-10" data-form="say"><label for="typed-answer" class="eyebrow sm">TYPE WHAT YOU WOULD SAY</label>' +
      '<input id="typed-answer" class="text-in" data-model="talk.draft" value="' + esc(T.draft) + '" placeholder="' + esc((T.hints[0] && T.hints[0].chips[0]) || 'I’d like…') + '" autocomplete="off" data-autofocus>' +
      '<div class="row gap-8"><button type="button" class="btn md btn-ghost" style="flex:1;height:50px;border-radius:12px" data-act="backToMic">Use mic</button><button type="submit" class="btn md btn-dark" style="flex:1.6;height:50px;border-radius:12px">Say it to ' + esc(c.name) + '</button></div></form>';
    if (T.phase === 'transcribing' || T.phase === 'thinking') dock += '<span class="eyebrow center" style="height:84px;display:flex;align-items:center;justify-content:center;font-size:13px">' + (T.phase === 'transcribing' ? 'TURNING YOUR VOICE INTO TEXT…' : esc(c.name.toUpperCase()) + ' IS THINKING…') + '</span>';
    if (T.phase === 'checking') dock += '<span class="eyebrow center" style="height:50px;display:flex;align-items:center;justify-content:center;font-size:13px;gap:10px"><span class="spinner"></span>PREPARING YOUR FEEDBACK…</span>';
    if (T.phase === 'result') dock += '<div class="row gap-10"><button class="btn md btn-ghost" style="flex:1" data-act="restartTalk">Practice again</button><button class="btn md btn-gold" style="flex:1.4" data-act="openReport">See full feedback</button></div>';

    return '<div class="screen">' +
      '<div class="talk-head">' + backBtn('leaveToBrief', 'Back to brief') +
        '<div class="col grow gap-6" style="min-width:0"><span class="t15 b7">' + esc(m.goal.replace(/\.$/, '')) + '</span>' +
          '<div class="row wrap gap-6" aria-label="' + doneCount + ' of ' + m.items.length + ' done">' + m.items.map((it, i) => '<span class="goal-chip ' + (T.checklist[it.id] ? 'done' : '') + '">' + (T.checklist[it.id] ? '✓' : '○') + ' ' + (i + 1) + ' ' + esc(it.label) + '</span>').join('') + '</div></div></div>' +
      '<div class="scroll" data-scroll="talk" data-stick="1"><div class="talk-log">' + log + '</div></div>' +
      '<div class="dock">' + dock + '</div></div>';
  };

  /* ---------- "Try it": the learner repeats a better sentence and gets a word-by-word check ---------- */
  const CONTRACTIONS = { "i'd": 'i would', "i'm": 'i am', "i'll": 'i will', "i've": 'i have', "it's": 'it is', "what's": 'what is', "that's": 'that is', "there's": 'there is', "don't": 'do not', "doesn't": 'does not', "can't": 'cannot', "isn't": 'is not', "aren't": 'are not', "they're": 'they are', "you're": 'you are', "we're": 'we are', "let's": 'let us', "where's": 'where is', "how's": 'how is', "won't": 'will not', "wouldn't": 'would not', "couldn't": 'could not' };
  const words = t => String(t || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/-/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)
    .flatMap(w => (CONTRACTIONS[w] || w).split(' ')).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  /* Longest common subsequence of words: which target words the learner said, in order. */
  function compareWords(target, said) {
    const t = words(target), s = words(said);
    const L = Array.from({ length: t.length + 1 }, () => new Array(s.length + 1).fill(0));
    for (let i = t.length - 1; i >= 0; i--) for (let j = s.length - 1; j >= 0; j--) L[i][j] = t[i] === s[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const hit = new Array(t.length).fill(false);
    for (let i = 0, j = 0; i < t.length && j < s.length;) { if (t[i] === s[j]) { hit[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const score = t.length + s.length ? Math.round(200 * L[0][0] / (t.length + s.length)) : 0;
    return { score, marks: t.map((w, i) => ({ w, ok: hit[i] })), missing: t.filter((w, i) => !hit[i]), extra: Math.max(0, s.length - L[0][0]) };
  }
  function drillControls(key, target, dark) {
    const R = S.report, D = S.drill, best = R.drills && R.drills[key];
    const badge = best ? '<span class="tag ' + (best.best >= 90 ? 'good' : '') + '">BEST ' + best.best + '%</span>' : '';
    const btn = dark ? 'hear-dark' : 'small-btn';
    if (!D || D.key !== key) return '<div class="row gap-8 wrap" style="align-items:center">' +
      '<button class="' + btn + '" data-act="say" data-text="' + esc(target) + '" data-rate="0.9">Hear it</button>' +
      '<button class="' + (dark ? 'save-btn' : 'small-btn try-btn') + '" style="flex:none;padding:0 14px" data-act="drillOpen" data-key="' + key + '">' + (best ? 'Try again' : 'Try it') + '</button>' + badge + '</div>';
    let body = '';
    if (D.phase === 'listening') body = '<div class="row gap-12" style="align-items:center"><div class="waves live sm" aria-hidden="true">' + [0, .15, .3, .1, .45].map(d => '<span class="ctbar" style="animation-delay:' + d + 's"></span>').join('') + '</div>' +
      '<span class="t14 b6 grow">● Recording <span id="rec-time">0:00</span></span><button class="small-btn" data-act="drillStop">Done</button></div>';
    else if (D.phase === 'transcribing') body = '<div class="row gap-10 t14 b6" style="align-items:center"><span class="spinner"></span>Checking what you said…</div>';
    else if (D.phase === 'typing') body = '<form class="col gap-8" data-form="drill"><input id="drill-input" class="text-in" data-model="drill.draft" value="' + esc(D.draft) + '" placeholder="Type the sentence" autocomplete="off" data-autofocus>' +
      '<div class="row gap-8"><button type="button" class="small-btn" data-act="drillMic">Use mic</button><button type="submit" class="small-btn" style="background:var(--ink);color:#fff;border-color:var(--ink)">Check</button></div></form>';
    else if (D.phase === 'result') {
      const r = D.result, great = r.score >= 90, close = r.score >= 70;
      body = '<div class="col gap-8"><span class="t15 b7" style="color:' + (great ? 'var(--good)' : close ? 'var(--info)' : 'var(--warn)') + '">' + (great ? 'Great match! ' : close ? 'Almost there. ' : 'Good try, let’s go again. ') + r.score + '%</span>' +
        '<div class="drill-words">' + r.marks.map(x => '<span class="' + (x.ok ? 'w-ok' : 'w-miss') + '">' + esc(x.w === 'i' ? 'I' : x.w) + '</span>').join(' ') + '</div>' +
        '<span class="t13 ink2">You said: “' + esc(D.said) + '”</span>' +
        (r.missing.length ? '<span class="t13 ink2">Listen for: <b>' + esc(r.missing.slice(0, 5).join(', ')) + '</b></span>' : r.extra ? '<span class="t13 ink2">All the words are there, with ' + plural(r.extra, 'extra word') + '.</span>' : '') +
        '<div class="row gap-8 wrap"><button class="small-btn" data-act="say" data-text="' + esc(D.target) + '" data-rate="0.85">Hear it slowly</button><button class="small-btn" data-act="drillMic">Try again</button><button class="small-btn" data-act="drillClose">Done</button></div></div>';
    } else body = '<div class="col gap-8"><span class="t13 ink2">Say it out loud, then I’ll check it word by word.</span><div class="row gap-8 wrap">' +
      '<button class="small-btn" style="background:var(--ink);color:#fff;border-color:var(--ink)" data-act="drillMic">🎤 Speak</button><button class="small-btn" data-act="drillType">Type</button><button class="small-btn" data-act="say" data-text="' + esc(target) + '" data-rate="0.85">Hear it first</button><button class="small-btn" data-act="drillClose">Cancel</button></div>' +
      (D.note ? '<span class="t13" style="color:var(--warn)">' + esc(D.note) + '</span>' : '') + '</div>';
    return '<div class="drill' + (dark ? ' on-dark' : '') + '">' + body + '</div>';
  }
  async function checkDrill(said) {
    const D = S.drill, R = S.report;
    D.said = said; D.result = compareWords(D.target, said); D.phase = 'result'; render();
    if (R.id) try { const r = await api('/api/attempts/' + R.id + '/drill', { method: 'POST', body: { key: D.key, score: D.result.score, said } }); R.drills = r.drills; render(); } catch (e) {}
  }

  /* Quick feedback on one learner line, shown right under their bubble. */
  function lineTip(t) {
    return '<div class="line-tip"><div class="row between gap-8"><span class="row gap-6 eyebrow xs" style="color:var(--teal)">' + I.bulb(13, '#0F5C52') + 'SAY IT MORE NATURALLY · ' + esc(t.kind.toUpperCase()) + '</span>' + hearBtn(t.better, 'Hear the better version', 'sm') + '</div>' +
      '<span class="t15 b6">“' + esc(unquote(t.better)) + '”</span>' + (t.why ? '<span class="t13 ink2">' + esc(t.why) + '</span>' : '') + '</div>';
  }

  function resultPanel() {
    const T = S.talk, R = T.result, m = T.mission, rep = R.report;
    const first = T.turns <= 1 && T.hintsUsed === 0;
    const verdictTag = !R.complete ? 'Keep going' : first ? 'First try' : 'With ' + m.character.name + '’s help';
    const verdictCls = !R.complete ? 'next' : first ? 'strong' : 'getting';
    const summary = !R.complete ? 'You can pick this up again any time. Your notebook keeps what you practiced.'
      : (T.turns <= 1 ? 'You did it all in one reply' : 'You finished in ' + T.turns + ' replies' + (T.tips ? ' with ' + plural(T.tips, 'coach tip') : '')) + (T.hintsUsed ? ', using ' + plural(T.hintsUsed, 'hint') : ', without hints') + '.';
    const fb = rep.feedback;
    return '<div class="col gap-12">' +
      '<div class="card col gap-10"><div class="row between gap-8"><span class="display" style="font-size:18px">' + (R.complete ? 'Mission complete' : 'Not finished yet') + '</span><span class="pill ' + verdictCls + '">' + esc(verdictTag) + '</span></div>' +
        m.items.map(it => '<div class="check-row"><span class="ic ' + (R.checklist[it.id] ? 'ok' : 'no') + '">' + (R.checklist[it.id] ? '✓' : '○') + '</span><span class="grow b6">' + esc(it.label) + '</span><span class="eyebrow sm" style="text-transform:none">' + (R.checklist[it.id] ? 'done' : 'not yet') + '</span></div>').join('') +
        '<span class="t13 ink2" style="border-top:1px dotted var(--line);padding-top:8px">' + esc(summary) + '</span></div>' +
      (fb.suggestion ? '<div class="card-dark col gap-8"><span class="eyebrow sm" style="color:var(--gold);letter-spacing:.1em">' + esc(fb.type) + '</span>' +
        '<span class="phrase">“' + esc(unquote(fb.suggestion)) + '”</span><span class="t14" style="line-height:1.5;color:#C9D8D4">' + esc(fb.why) + '</span>' +
        '<div class="row gap-8"><button class="hear-dark" data-act="say" data-text="' + esc(fb.suggestion) + '" data-rate="0.9">Hear it</button>' +
          '<button class="save-btn ' + (T.savedId ? 'on' : '') + '" data-act="toggleSave">' + (T.savedId ? 'Saved to notebook ✓' : 'Save to notebook') + '</button></div>' +
        '<span class="eyebrow xs" style="color:#9DB0AA">AI FEEDBACK · GROQ</span></div>' : '') +
    '</div>';
  }

  /* ---------- full feedback ---------- */
  VIEWS.feedback = () => {
    const R = S.report, rep = R.report, m = R.mission;
    const mine = R.log.filter(x => x.who === 'me');
    // Reports from before line-by-line review existed fall back to the live tips.
    const lines = rep.lines && rep.lines.length ? rep.lines : mine.map(x => x.tip ? { said: x.text, ok: false, better: x.tip.better, why: x.tip.why, kind: x.tip.kind } : { said: x.text, ok: true, better: x.text, why: '', kind: 'Natural' });
    const okCount = lines.filter(l => l.ok).length;
    const practiceN = rep.skills.filter(k => k.status !== 'Strong').length;
    const g = R.goal;
    return '<div class="screen pad-20">' +
      '<div class="row gap-12">' + backBtn(S.reportFrom === 'progress' ? 'goProgress' : 'goHome', 'Done', 'close') +
        '<div class="col"><span class="display" style="font-size:22px">How you did</span><span class="t13 muted">Mission ' + m.n + ' · ' + esc(m.title) + (R.complete ? '' : ' · not finished') + '</span></div></div>' +
      '<div class="scroll col gap-12" data-scroll="feedback" style="padding-bottom:4px">' +
        '<div class="card-soft row gap-12" style="align-items:center"><span class="display" style="font-size:30px;color:var(--teal)">' + okCount + '/' + lines.length + '</span>' +
          '<span class="col gap-2"><span class="t15 b7">' + (okCount === lines.length ? 'Every sentence sounded natural!' : okCount ? plural(okCount, 'sentence') + ' already sounded natural' : 'Let’s polish what you said') + '</span>' +
          '<span class="t13 ink2">' + (lines.length - okCount ? 'Below, each sentence has a better version. Tap “Try it” to say it yourself.' : 'Try the improved version below to make it even smoother.') + '</span></span></div>' +
        '<div class="card-dark col gap-6" style="padding:14px 16px"><span class="eyebrow sm" style="color:var(--gold)">' + (rep.improved.perfect ? 'YOUR FIRST SENTENCE · NOTHING TO FIX' : 'SAY IT ALL IN ONE GO') + '</span>' +
          (rep.improved.perfect ? '' : '<span class="t14" style="color:#9DB0AA;text-decoration:line-through">“' + esc(rep.improved.first) + '”</span>') +
          '<span class="phrase" style="font-size:18px">“' + esc(unquote(rep.improved.better)) + '”</span>' +
          (rep.improved.why ? '<span class="t13" style="line-height:1.45;color:#C9D8D4">' + esc(rep.improved.why) + '</span>' : '') +
          drillControls('best', rep.improved.better, true) + '</div>' +
        '<h2 class="h-xs" style="margin-top:4px">Sentence by sentence</h2>' +
        lines.map((l, i) => '<div class="card col gap-6 line-card ' + (l.ok ? 'natural' : '') + '">' +
          '<div class="row between gap-8"><span class="eyebrow sm">' + String(i + 1).padStart(2, '0') + ' · YOU SAID</span>' + (l.ok ? '<span class="tag good">✓ NATURAL</span>' : '<span class="tag warn">' + esc(l.kind.toUpperCase()) + '</span>') + '</div>' +
          '<span class="t15 ' + (l.ok ? '' : 'muted') + '" style="line-height:1.4">“' + esc(l.said) + '”</span>' +
          (l.ok ? '' : '<div class="col gap-4" style="border-top:1px dotted var(--line);padding-top:8px"><span class="eyebrow xs" style="color:var(--teal)">MORE NATURAL</span><span class="t16 b7" style="line-height:1.35">“' + esc(unquote(l.better)) + '”</span>' + (l.why ? '<span class="t13 ink2 lh">' + esc(l.why) + '</span>' : '') + '</div>' +
            drillControls(String(i), l.better, false)) +
        '</div>').join('') +
        '<h2 class="h-xs" style="margin-top:4px">Your skills</h2>' +
        rep.skills.map(k => '<div class="card col gap-4" style="padding:12px 16px"><div class="row between gap-8"><span class="t16 b7">' + esc(k.name) + '</span>' + pill(k.status) + '</div><span class="t14 lh ink2">' + esc(k.note) + '</span></div>').join('') +
        (R.compare ? '<div class="cmp"><div class="r head"><span>SKILL</span><span>LAST TIME</span><span>THIS TIME</span></div>' +
          R.compare.rows.map(r => '<div class="r"><span class="b7">' + esc(r.name) + '</span><span>' + pill(r.before) + '</span><span>' + pill(r.after) + '</span></div>').join('') +
          '<div class="r"><span class="b7">Replies needed</span><span>' + R.compare.turnsBefore + '</span><span class="' + (R.turns <= R.compare.turnsBefore ? 'ok b6' : '') + '">' + R.turns + '</span></div></div>' : '') +
        ((g || rep.expressions.length) ? '<div class="card col gap-12" style="border-radius:18px;padding:16px"><span class="t16 b7">Notebook updated</span>' +
          (g && g.title ? '<div class="col gap-6"><div class="row between t14 gap-8"><span>' + esc(shortGoal(g)) + '</span><span class="eyebrow sm" style="color:var(--teal);flex:none">' + (g.mastered ? 'MASTERED ✓' : 'USED ' + g.uses + ' / ' + g.target) + '</span></div><div class="bar"><div style="width:' + Math.round(100 * Math.min(g.uses, g.target) / g.target) + '%"></div></div></div>' : '') +
          (g && g.next ? '<div class="row gap-8 t14"><span class="tag">NEW GOAL</span><span>' + esc(g.next) + '</span></div>' : '') +
          rep.expressions.map(e => '<div class="row gap-8 t14"><span class="tag">NEW</span><span>' + esc(e.phrase) + '</span></div>').join('') + '</div>' : '') +
        (R.unlocked ? '<button class="row gap-12" data-act="openBrief" data-id="' + R.unlocked.id + '" style="background:var(--teal);color:#fff;border-radius:16px;padding:14px 16px">' + I.lock(24) +
          '<span class="col grow"><span class="b7">Unlocked: ' + esc(R.unlocked.title) + '</span><span class="t13" style="color:var(--teal-text)">' + esc(R.unlocked.followUp || 'Ready when you are.') + '</span></span></button>' : '') +
      '</div>' +
      '<div class="row gap-10" style="background:var(--teal-soft);border-radius:14px;padding:12px 14px;font-size:14px">' + I.book(22) +
        '<span>' + (rep.practice.length ? plural(rep.practice.length, 'skill') + ' added to your notebook to practice next time.' : practiceN ? 'Your notebook keeps your new phrases for next time.' : 'Nothing to fix this time. Your notebook saved your best phrases.') + '</span></div>' +
      '<div class="row gap-10"><button class="btn md btn-ghost" style="flex:1" data-act="go" data-to="notebook">Open notebook</button><button class="btn md btn-dark" style="flex:1" data-act="goHome">Back to home</button></div>' +
    '</div>';
  };

  /* ---------- notebook ---------- */
  VIEWS.notebook = () => {
    const me = st(), g = me.activeGoal;
    const tag = (label, kind) => '<span class="tag ' + (kind || '') + '">' + esc(label) + '</span>';
    const card = (title, sub, tags, sayText, removeId, big) => '<div class="card col gap-6"><div class="row between gap-10" style="align-items:flex-start"><span class="' + (big ? 'phrase' : 't16 b7') + '">' + esc(title) + '</span>' +
      (sayText ? hearBtn(sayText) : '') + '</div>' + (sub ? '<span class="t14 ink2">' + esc(sub) + '</span>' : '') +
      '<div class="row between gap-8"><div class="row wrap gap-8">' + tags.join('') + '</div>' + (removeId ? '<button class="remove" data-act="removeNote" data-id="' + removeId + '">Remove</button>' : '') + '</div></div>';
    let cards = [];
    if (S.nbTab === 0) cards = me.notebook.filter(n => n.kind === 'expression').map(n => card(n.title, n.sub,
      [n.missionTitle ? tag('FROM ' + n.missionTitle.toUpperCase()) : '', n.status === 'mastered' ? tag('MASTERED', 'good') : n.source === 'saved' ? tag('SAVED') : n.seen > 1 ? tag('SEEN ×' + n.seen, 'good') : tag('NEW', 'good')], n.say, n.id, true));
    if (S.nbTab === 1) cards = me.notebook.filter(n => n.kind === 'practice').map(n => card(n.title, n.sub,
      [n.status === 'improving' ? tag('IMPROVING', 'good') : n.seen > 1 ? tag('RECURRING ×' + n.seen, 'warn') : tag('NEXT MISSION', 'warn'), n.missionTitle ? tag(n.missionTitle.toUpperCase()) : ''], n.say, n.id));
    if (S.nbTab === 2) cards = me.history.map(h => '<button class="hist-row" data-act="openAttempt" data-id="' + h.id + '">' + (h.complete ? I.check(22, '#1D7A45') : '<span style="width:22px;text-align:center;color:var(--warn);font-weight:800">○</span>') +
      '<span class="col grow gap-2"><span class="b7">' + esc(h.title) + '</span><span class="t13 muted">' + esc(h.pathLabel) + ' · ' + esc(fmtDay(h.day)) + ' · ' + plural(h.turns, 'reply', 'replies') + ', ' + plural(h.hintsUsed, 'hint') + '</span>' + (h.summary ? '<span class="t13 ink2">' + esc(h.summary) + '</span>' : '') + '</span>' + I.chev() + '</button>');
    const empty = ['Nothing here yet. Finish a mission and your first expressions show up here.', 'Nothing to practice yet. After each mission, things to work on land here.', 'No missions yet. Your first one is waiting on Home.'][S.nbTab];
    const p = activePath(), nm = nextMission(p);
    return '<div class="screen"><div class="scroll col gap-16" data-scroll="nb' + S.nbTab + '" style="padding:48px 20px 16px">' +
      '<div class="col gap-4"><h1 class="h-l">My notebook</h1><span class="t14 muted">Everything you learn, ready for your next mission.</span></div>' +
      (g ? '<div class="card-soft col gap-6"><span class="eyebrow xs" style="color:var(--teal)">ACTIVE GOAL · CARRIED INTO YOUR NEXT MISSION</span><span class="t16 b7" style="line-height:1.3">' + esc(g.title) + '</span><span class="t13 ink2">' + esc(g.why) + '</span>' +
        '<div class="row gap-8" style="margin-top:2px"><div class="bar grow"><div style="width:' + Math.round(100 * Math.min(g.uses || 0, 3) / 3) + '%"></div></div><span class="eyebrow sm" style="color:var(--teal)">USED ' + (g.uses || 0) + ' OF 3</span></div>' +
        '<button class="row gap-8" data-act="say" data-text="' + esc(g.tryIt) + '" style="padding:8px 12px;border-radius:12px;background:#fff;border:1px solid var(--teal-line);font-size:14px"><span class="muted" style="flex:none">Try saying:</span><span class="grow" style="font-style:italic">“' + esc(unquote(g.tryIt)) + '”</span><span style="color:var(--teal);flex:none">' + I.speaker() + '</span></button></div>' : '') +
      '<div class="seg" role="tablist" aria-label="Notebook sections">' + ['Expressions', 'To practice', 'History'].map((l, i) => '<button role="tab" aria-selected="' + (S.nbTab === i) + '" class="' + (S.nbTab === i ? 'on' : '') + '" data-act="nbTab" data-i="' + i + '">' + l + '</button>').join('') + '</div>' +
      (cards.length ? cards.join('') : '<div class="card dashed t15 ink2" style="padding:20px">' + empty + '</div>') +
      '<div class="grow"></div>' +
      (nm && me.history.length ? '<button class="col gap-2" data-act="openBrief" data-id="' + nm.id + '" style="padding:14px 16px;border-radius:16px;background:var(--teal);color:#fff"><span class="eyebrow sm" style="color:var(--teal-text)">NEXT MISSION IS READY</span><span class="t16 b7">Practice these in “' + esc(nm.title) + '” →</span></button>' : '') +
    '</div>' + nav('notebook') + '</div>';
  };
  const fmtDay = d => { if (!d) return ''; if (d === today()) return 'Today'; const y = new Date(); y.setDate(y.getDate() - 1); if (d === y.toISOString().slice(0, 10)) return 'Yesterday'; return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

  /* ---------- progress ---------- */
  VIEWS.progress = () => {
    const me = st(), s = me.stats;
    const pct = Math.min(100, Math.round(100 * s.todayMinutes / s.dailyMinutes));
    return '<div class="screen"><div class="scroll col gap-16" data-scroll="progress" style="padding:48px 20px 16px">' +
      '<div class="row gap-12">' + backBtn('goHome', 'Back to home') + '<h1 class="h-l">My progress</h1></div>' +
      '<div class="grid3"><div class="stat"><b>' + s.streak + '</b><span>Day streak</span></div><div class="stat"><b>' + s.missionsDone + '</b><span>Missions done</span></div><div class="stat"><b>' + s.notebookCount + '</b><span>Notebook items</span></div></div>' +
      '<div class="card col gap-6"><div class="row between t14"><span class="b7">Today’s practice</span><span class="muted">' + s.todayMinutes + ' / ' + s.dailyMinutes + ' min</span></div><div class="bar"><div style="width:' + pct + '%"></div></div>' +
        '<span class="t13 muted">' + (pct >= 100 ? 'Daily goal reached. Nice work!' : s.practicedToday ? 'Keep going to reach your daily goal.' : 'Finish a mission today to keep your streak.') + '</span></div>' +
      (me.skills.length ? '<h2 class="h-xs">Latest skills</h2><div class="card col" style="padding:4px 16px">' + me.skills.map((k, i) => '<div class="row between gap-8" style="padding:10px 0;' + (i ? 'border-top:1px solid var(--line-2)' : '') + '"><span class="t14 b6">' + esc(k.name) + '</span>' + pill(k.status) + '</div>').join('') + '</div>' : '') +
      '<h2 class="h-xs">Mission history</h2>' +
      (me.history.length ? me.history.slice(0, 20).map(h => '<button class="hist-row" data-act="openAttempt" data-id="' + h.id + '">' + (h.complete ? I.check(22, '#1D7A45') : '<span style="width:22px;text-align:center;color:var(--warn);font-weight:800">○</span>') +
        '<span class="col grow"><span class="b7">' + esc(h.title) + '</span><span class="t13 muted">Mission ' + h.n + ' · ' + esc(h.pathLabel) + ' · ' + esc(fmtDay(h.day)) + ' · ' + plural(h.turns, 'reply', 'replies') + ', ' + plural(h.hintsUsed, 'hint') + '</span></span>' + I.chev() + '</button>').join('')
        : '<div class="card dashed t15 ink2" style="padding:18px">No missions yet. Your first one is waiting on Home.</div>') +
      '<h2 class="h-xs">Account</h2><div class="card col" style="padding:4px 16px">' +
        '<button class="row between" style="padding:12px 0" data-act="editPrefs"><span class="col"><span class="t15 b7">Preferences</span><span class="t13 muted">' + esc(me.user.levelLabel) + ' · ' + me.user.goals.length + ' path' + (me.user.goals.length > 1 ? 's' : '') + ' · ' + me.user.dailyMinutes + ' min a day · ' + (me.user.hintStyle === 'full' ? 'full-answer hints' : 'step-by-step hints') + '</span></span>' + I.chev() + '</button>' +
        '<button class="row between" style="padding:12px 0;border-top:1px solid var(--line-2)" data-act="logout"><span class="t15 b7" style="color:var(--warn)">Sign out</span></button></div>' +
    '</div>' + nav('progress') + '</div>';
  };

  /* ================= ACTIONS ================= */
  function setMe(state) { S.me = state; if (state.ai) S.ai = state.ai; }
  async function refresh() { setMe(await api('/api/me?today=' + today())); }

  const ACT = {
    closeToast() { S.toast = ''; render(); },
    go(d) { go(d.to); },
    goHome() { go('home'); },
    goProgress() { go('progress'); },
    goWelcome() { go(S.me && S.me.user ? 'home' : 'welcome'); },
    say(d) { say(d.text, d.rate ? Number(d.rate) : undefined); },

    startOnboard() { S.onboard = { name: '', pin: '', level: 0, goals: { food: true }, time: 0, hintStyle: 'steps', error: '', busy: false, edit: false }; go('name'); },
    pickHintStyle(d) { S.onboard.hintStyle = d.v; render(); },
    backToName() { S.onboard.error = ''; go('name'); },
    pickLevel(d) { S.onboard.level = Number(d.i); render(); },
    toggleGoal(d) { S.onboard.goals[d.g] = !S.onboard.goals[d.g]; S.onboard.error = ''; render(); },
    pickTime(d) { S.onboard.time = Number(d.i); render(); },
    async finishOnboard() {
      const O = S.onboard, goals = GOALS.map(g => g[0]).filter(g => O.goals[g]);
      if (!goals.length) { O.error = 'Pick at least one place where you want to feel confident.'; return render(); }
      O.busy = true; O.error = ''; render();
      try {
        setMe(await api('/api/signup', { method: 'POST', body: { name: O.name, pin: O.pin, level: O.level, goals, dailyMinutes: TIMES[O.time], hintStyle: O.hintStyle } }));
        O.busy = false; go('home');
      } catch (e) {
        O.busy = false;
        if (e.status === 409 || /name|PIN/i.test(e.message)) { O.error = e.message; go('name'); } else { O.error = e.message; render(); }
      }
    },
    editPrefs() {
      const u = st().user;
      S.onboard = { name: u.name, pin: '', level: u.level, goals: Object.fromEntries(u.goals.map(g => [g, true])), time: Math.max(0, TIMES.indexOf(u.dailyMinutes)), hintStyle: u.hintStyle || 'steps', error: '', busy: false, edit: true };
      go('level');
    },
    async savePrefs() {
      const O = S.onboard, goals = GOALS.map(g => g[0]).filter(g => O.goals[g]);
      if (!goals.length) { O.error = 'Pick at least one place where you want to feel confident.'; return render(); }
      O.busy = true; render();
      try { setMe(await api('/api/me', { method: 'PATCH', body: { level: O.level, goals, dailyMinutes: TIMES[O.time], hintStyle: O.hintStyle } })); O.busy = false; go('progress'); toast('Preferences saved.'); }
      catch (e) { O.busy = false; O.error = e.message; render(); }
    },
    async logout() {
      try { await api('/api/logout', { method: 'POST', body: {} }); } catch (e) {}
      S.me = null; S.login = { name: '', pin: '', error: '', busy: false }; go('welcome');
    },
    async setPath(d) {
      S.me.user.activePath = d.id; render();
      try { setMe(await api('/api/me', { method: 'PATCH', body: { activePath: d.id } })); render(); } catch (e) { toast(e.message); }
    },
    async addPath(d) {
      try { setMe(await api('/api/me', { method: 'PATCH', body: { goals: st().user.goals.concat(d.id), activePath: d.id } })); render(); } catch (e) { toast(e.message); }
    },
    nbTab(d) { S.nbTab = Number(d.i); render(); },
    async removeNote(d) {
      try { const r = await api('/api/notebook/' + d.id + '?today=' + today(), { method: 'DELETE' }); setMe(r.state); render(); } catch (e) { toast(e.message); }
    },

    async openBrief(d) {
      S.brief = null; S.briefId = d.id; go('brief');
      try { S.brief = await api('/api/missions/' + d.id); if (S.screen === 'brief') render(); }
      catch (e) { toast(e.message); go('home'); }
    },
    async startTalk(d) {
      if (S.busy) return;
      S.busy = true; render();
      try {
        const r = await api('/api/attempts', { method: 'POST', body: { missionId: d.id } });
        S.busy = false;
        S.talk = newTalk(r);
        go('talk');
        say(r.log[0].text);
      } catch (e) { S.busy = false; render(); toast(e.message); }
    },
    leaveToBrief() {
      const T = S.talk;
      if (T && T.turns > 0 && T.phase !== 'result' && !confirm('Leave this conversation? Your replies so far won’t be reviewed.')) return;
      ACT.openBrief({ id: T.mission.id });
    },
    async restartTalk() { await ACT.startTalk({ id: S.talk.mission.id }); },

    toggleSlow() { const T = S.talk; T.slow = !T.slow; render(); say(lastJo(), T.slow ? 0.72 : undefined); },
    replay() { say(lastJo()); },
    toggleHints() {
      const T = S.talk;
      if (T.hint === 0) { T.hint = T.hintStyle === 'full' ? 3 : 1; T.hintsUsed++; T.showHints = true; }
      else if (!T.showHints) T.showHints = true;
      else if (T.hint < 3) { T.hint++; T.hintsUsed++; }
      render();
    },
    moreHint() { const T = S.talk; if (T.hint < 3) { T.hint++; T.hintsUsed++; } render(); },
    fullHint() { const T = S.talk; if (T.hint < 3) { T.hintsUsed += 3 - T.hint; T.hint = 3; } render(); },
    nudgeHint() { S.talk.hint = 1; render(); },
    dismissHint() { S.talk.showHints = false; render(); },
    useChip(d) {
      const T = S.talk, clean = d.text.replace(/…/g, '').trim();
      say(clean);
      const base = T.phase === 'typing' && T.draft ? T.draft.replace(/\s*$/, ' ') : '';
      T.draft = (base + clean).replace(/^\w/, c => c.toUpperCase()); T.phase = 'typing'; T.note = '';
      render();
      const f = document.getElementById('typed-answer'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
    },
    goType() { S.talk.phase = 'typing'; S.talk.note = ''; render(); },
    backToMic() { S.talk.phase = 'ready'; S.talk.note = ''; render(); },
    startMic() { startRecording(); },
    stopMic() { const T = S.talk; if (T.demo) { clearInterval(T.timer); sendTurn(T.demoText); } else stopRecording(); },
    playDemo(d) {
      const T = S.talk, words = d.text.split(' ');
      let i = 0;
      clearInterval(T.timer);
      Object.assign(T, { phase: 'listening', demo: true, demoText: d.text, live: '', note: '', showHints: false });
      render(); say(d.text, 0.95);
      T.timer = setInterval(() => {
        i++; T.live = words.slice(0, i).join(' '); render();
        if (i >= words.length) { clearInterval(T.timer); setTimeout(() => { if (S.talk === T && T.phase === 'listening' && T.demo) sendTurn(d.text); }, 600); }
      }, 320);
    },
    endTalk() { finishTalk(); },
    async toggleSave() {
      const T = S.talk, fb = T.result.report.feedback;
      try {
        if (T.savedId) { const r = await api('/api/notebook/' + T.savedId + '?today=' + today(), { method: 'DELETE' }); T.savedId = null; setMe(r.state); }
        else { const r = await api('/api/notebook', { method: 'POST', body: { title: unquote(fb.suggestion), sub: fb.why, missionId: T.mission.id } }); T.savedId = r.id; setMe(r.state); }
        render();
      } catch (e) { toast(e.message); }
    },
    drillOpen(d) {
      const R = S.report, rep = R.report;
      const lines = rep.lines && rep.lines.length ? rep.lines : R.log.filter(x => x.who === 'me').map(x => ({ better: x.tip ? x.tip.better : x.text }));
      stopRecording(true);
      S.drill = { key: d.key, target: unquote(d.key === 'best' ? rep.improved.better : lines[Number(d.key)].better), phase: 'idle', draft: '', said: '', result: null, note: '' };
      render();
    },
    drillClose() { stopRecording(true); S.drill = null; render(); },
    drillType() { S.drill.phase = 'typing'; S.drill.note = ''; render(); },
    drillStop() { stopRecording(); },
    drillMic() {
      const D = S.drill, R = S.report;
      recordSpeech({
        missionId: R.mission.id || R.missionId || '', alive: () => S.drill === D && S.screen === 'feedback',
        onStart() { D.phase = 'listening'; D.note = ''; render(); },
        onTranscribing() { D.phase = 'transcribing'; render(); },
        onText: checkDrill,
        onFail(msg, typeInstead) { D.phase = typeInstead ? 'typing' : 'idle'; D.note = msg; render(); }
      });
    },
    openReport() { S.report = Object.assign({ mission: S.talk.mission }, S.talk.result); S.reportFrom = 'talk'; go('feedback'); },
    async openAttempt(d) {
      try {
        const r = await api('/api/attempts/' + d.id);
        const m = missionById(r.missionId) || { n: '', title: r.missionId, character: { name: 'Jo' } };
        S.report = Object.assign({ mission: m, compare: null, goal: null, unlocked: null }, r);
        S.reportFrom = S.screen === 'progress' ? 'progress' : 'notebook';
        go('feedback');
      } catch (e) { toast(e.message); }
    }
  };

  /* ---------------- conversation ---------------- */
  function newTalk(r) {
    return {
      attemptId: r.attemptId, mission: r.mission, log: r.log.slice(), checklist: Object.assign({}, r.checklist),
      phase: 'ready', live: '', draft: '', note: '', turns: 0, tips: 0, hintsUsed: 0, hint: 0, showHints: false,
      hints: r.mission.openingHints, suggestions: r.mission.samples.slice(0, 3), prompt: r.mission.prompt,
      lastHeard: '', lastStatus: '', slow: false, hintStyle: (S.me && S.me.user.hintStyle) || 'steps', demo: false, demoText: '', timer: null, result: null, savedId: null
    };
  }
  const lastJo = () => { const l = S.talk.log; for (let i = l.length - 1; i >= 0; i--) if (l[i].who === 'jo') return l[i].text; return ''; };

  async function sendTurn(text) {
    const T = S.talk;
    text = String(text || '').trim();
    if (!text) { T.phase = 'typing'; T.note = 'Type your answer first.'; return render(); }
    clearInterval(T.timer);
    T.log.push({ who: 'me', text });
    Object.assign(T, { phase: 'thinking', live: '', draft: '', note: '', demo: false, showHints: false, lastHeard: text, lastStatus: '' });
    render();
    try {
      const r = await api('/api/attempts/' + T.attemptId + '/turn', { method: 'POST', body: { text, hintsUsed: T.hintsUsed } });
      if (S.talk !== T) return;
      T.turns = r.turns;
      T.log.push({ who: 'jo', text: r.reply });
      if (r.coach) { T.log.push({ who: 'coach', text: r.coach }); T.tips++; }
      T.checklist = r.checklist;
      T.lastHeard = r.heard || text;
      T.lastStatus = r.understood ? 'understood' : 'unclear';
      if (r.hints) T.hints = r.hints;
      T.suggestions = r.suggestions || [];
      T.prompt = r.prompt || T.prompt;
      const stuck = !r.complete && ((!r.understood && T.turns >= 2) || T.turns >= 4);
      const mine = T.log.filter(x => x.who === 'me'); if (r.lineTip && mine.length) mine[mine.length - 1].tip = r.lineTip;
      T.hint = stuck ? (T.hintStyle === 'full' ? 3 : 1) : 0; T.showHints = stuck; if (stuck) T.hintsUsed++;
      T.phase = 'ready';
      render();
      say(r.reply);
      if (r.complete) setTimeout(() => { if (S.talk === T) finishTalk(); }, 900);
    } catch (e) {
      if (S.talk !== T) return;
      T.log.pop();
      Object.assign(T, { phase: 'typing', draft: text, note: e.message, lastHeard: '' });
      render();
    }
  }

  async function finishTalk() {
    const T = S.talk;
    if (T.phase === 'checking' || T.phase === 'result') return;
    T.phase = 'checking'; T.showHints = false; render();
    try {
      const r = await api('/api/attempts/' + T.attemptId + '/finish', { method: 'POST', body: { hintsUsed: T.hintsUsed } });
      if (S.talk !== T) return;
      setMe(r.state);
      T.result = r; T.checklist = r.checklist; T.phase = 'result';
      render();
    } catch (e) {
      if (S.talk !== T) return;
      T.phase = 'ready'; T.note = e.message + ' Tap “End & review” to try again.'; render();
    }
  }

  function leaveTalk() {
    const T = S.talk; if (!T) return;
    clearInterval(T.timer);
    stopRecording(true);
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }

  /* ---------------- microphone → Whisper ---------------- */
  let rec = null;
  /* Records one answer and turns it into text with Whisper. Used by the conversation and the feedback drills.
     h: { missionId, alive(), onStart(), onTranscribing(), onText(text), onFail(message, typeInstead) } */
  async function recordSpeech(h) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return h.onFail('Voice input isn’t supported in this browser. You can type instead.', true);
    try { window.speechSynthesis.cancel(); } catch (e) {}
    stopRecording(true);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return h.onFail('The microphone is blocked. Allow it in your browser, or type instead.', true); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    const started = Date.now();
    rec = { mr, stream, cancelled: false, raf: 0, tick: 0, ctx: null };
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec; rec = null;
      cleanupRec(r);
      if (r.cancelled || !h.alive()) return;
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
      if (Date.now() - started < 500 || blob.size < 1500) return h.onFail('That was very short. Hold on a moment longer, then tap to finish.', false);
      h.onTranscribing();
      try {
        const out = await api('/api/transcribe?missionId=' + encodeURIComponent(h.missionId), { method: 'POST', body: blob });
        if (!h.alive()) return;
        if (!out.text || !/[a-z]/i.test(out.text)) return h.onFail('I didn’t hear anything. Tap the mic and try again, or type it.', false);
        h.onText(out.text);
      } catch (e) { if (h.alive()) h.onFail(e.message + ' You can type instead.', true); }
    };
    mr.start(250);
    h.onStart();
    // Live level meter and timer, updated in place so the page doesn't re-render every frame.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 256; src.connect(an); rec.ctx = ctx;
      const data = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        if (!rec || rec.mr !== mr) return;
        an.getByteFrequencyData(data);
        $stage.querySelectorAll('.waves.live .ctbar').forEach((b, i) => { const v = data[3 + i * 4] / 255; b.style.transform = 'scaleY(' + Math.max(0.12, Math.min(1, v * 1.4)).toFixed(2) + ')'; });
        rec.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { $stage.querySelectorAll('.waves.live').forEach(w => w.classList.remove('live')); }
    rec.tick = setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000), el = document.getElementById('rec-time');
      if (el) el.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      if (sec >= 30) stopRecording();
    }, 250);
  }
  function startRecording() {
    const T = S.talk;
    recordSpeech({
      missionId: T.mission.id, alive: () => S.talk === T,
      onStart() { Object.assign(T, { phase: 'listening', demo: false, live: '', note: '', showHints: false }); render(); },
      onTranscribing() { T.phase = 'transcribing'; render(); },
      onText: sendTurn,
      onFail(msg, typeInstead) { T.phase = typeInstead ? 'typing' : 'ready'; T.note = msg; render(); }
    });
  }
  function stopRecording(cancel) {
    if (!rec) return;
    rec.cancelled = !!cancel;
    try { if (rec.mr.state !== 'inactive') rec.mr.stop(); else cleanupRec(rec); } catch (e) { cleanupRec(rec); }
  }
  function cleanupRec(r) {
    if (!r) return;
    cancelAnimationFrame(r.raf); clearInterval(r.tick);
    try { r.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { r.ctx && r.ctx.close(); } catch (e) {}
  }

  /* ---------------- forms ---------------- */
  const FORMS = {
    name() {
      const O = S.onboard;
      O.name = O.name.trim();
      if (!O.name) { O.error = 'Type your name to continue.'; return render(); }
      if (!/^\d{4}$/.test(O.pin)) { O.error = 'Your PIN must be 4 digits.'; return render(); }
      O.error = ''; go('level');
    },
    async login() {
      const L = S.login;
      if (!L.name.trim() || !/^\d{4}$/.test(L.pin)) { L.error = 'Type your name and your 4-digit PIN.'; return render(); }
      L.busy = true; L.error = ''; render();
      try { setMe(await api('/api/login', { method: 'POST', body: { name: L.name, pin: L.pin } })); L.busy = false; L.pin = ''; go('home'); }
      catch (e) { L.busy = false; L.error = e.message; render(); }
    },
    say() { sendTurn(S.talk.draft); },
    drill() { const t = (S.drill.draft || '').trim(); if (t) checkDrill(t); }
  };

  /* ---------------- events ---------------- */
  $stage.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });
  $stage.addEventListener('input', e => {
    const el = e.target, path = el.dataset && el.dataset.model;
    if (!path) return;
    const [obj, key] = path.split('.');
    let v = el.value;
    if (el.inputMode === 'numeric') { v = v.replace(/\D/g, '').slice(0, 4); if (v !== el.value) el.value = v; }
    if (S[obj]) { S[obj][key] = v; if (S[obj].error) { S[obj].error = ''; const er = $stage.querySelector('.err'); if (er) er.remove(); } }
  });
  $stage.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const fn = FORMS[f.dataset.form];
    if (fn) fn();
  });

  /* ---------------- fit the phone frame on desktop ---------------- */
  function fit() {
    if (window.innerWidth <= 480) { $stage.style.transform = ''; return; }
    const s = Math.min(1, (window.innerWidth - 32) / 390, (window.innerHeight - 32) / 844);
    $stage.style.transform = s < 1 ? 'scale(' + s + ')' : '';
  }
  window.addEventListener('resize', fit); fit();

  /* ---------------- boot ---------------- */
  (async function boot() {
    try {
      const r = await api('/api/me?today=' + today());
      S.ai = r.ai || S.ai;
      if (r.user) { setMe(r); go('home'); } else go('welcome');
    } catch (e) { go('welcome'); toast(e.message); }
  })();
})();
