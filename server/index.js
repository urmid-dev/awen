import express from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, json, now } from './db.js';
import { PATHS, MISSIONS, byId, pathMissions, publicMission } from './missions.js';
import { turn, report, LEVELS } from './coach.js';
import { transcribe, hasKey, isMock, AIError } from './groq.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(join(here, '..', 'public')));

const GOAL_TARGET = 3;
const COOKIE = 'ct_session';
const YEAR = 365 * 24 * 3600 * 1000;

/* ---------------- helpers ---------------- */

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const route = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(e => {
  const status = e.status || 500;
  if (status >= 500 && !(e instanceof AIError)) console.error(e);
  res.status(status).json({ error: e.message || 'Something went wrong.' });
});
const norm = s => String(s || '').toLowerCase().replace(/[’'`"“”]/g, '').replace(/[^a-z0-9_ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(pin, salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex'), b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function startSession(res, userId) {
  const token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: YEAR, path: '/' });
}
function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}
function auth(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

function validProfile(body, partial) {
  const out = {};
  if (!partial || body.level !== undefined) {
    const level = Number(body.level);
    if (!(level >= 0 && level < LEVELS.length)) throw new HttpError(400, 'Pick how speaking feels right now.');
    out.level = Math.floor(level);
  }
  if (!partial || body.goals !== undefined) {
    const goals = (Array.isArray(body.goals) ? body.goals : []).filter(g => PATHS.some(p => p.id === g));
    if (!goals.length) throw new HttpError(400, 'Pick at least one place where you want to feel confident.');
    out.goals = [...new Set(goals)];
  }
  if (!partial || body.dailyMinutes !== undefined) {
    const mins = Number(body.dailyMinutes);
    out.dailyMinutes = [5, 10, 15].includes(mins) ? mins : 5;
  }
  if (!partial || body.hintStyle !== undefined) out.hintStyle = body.hintStyle === 'full' ? 'full' : 'steps';
  return out;
}

/* ---------------- state for the app ---------------- */

function attemptsOf(userId) {
  return db.prepare('SELECT * FROM attempts WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC').all(userId)
    .map(a => ({ ...a, report: json(a.report, null), checklist: json(a.checklist, {}) }));
}
function completedSet(attempts) { return new Set(attempts.filter(a => a.complete).map(a => a.mission_id)); }

function missionStatus(m, done) {
  if (done.has(m.id)) return 'done';
  const prev = pathMissions(m.path).find(x => x.n === m.n - 1);
  return !prev || done.has(prev.id) ? 'today' : 'locked';
}

function streak(attempts, today) {
  const days = new Set(attempts.filter(a => a.complete).map(a => a.day).filter(Boolean));
  if (!days.size) return 0;
  const d = new Date((isDay(today) ? today : dayOf(now())) + 'T00:00:00Z');
  const key = () => d.toISOString().slice(0, 10);
  if (!days.has(key())) d.setUTCDate(d.getUTCDate() - 1);   // yesterday still counts until today ends
  let n = 0;
  while (days.has(key())) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

function buildState(u, today) {
  const goals = json(u.goals, ['food']);
  const attempts = attemptsOf(u.id);
  const done = completedSet(attempts);
  const day = isDay(today) ? today : dayOf(now());
  const todayMs = attempts.filter(a => a.day === day).reduce((s, a) => s + Math.min(15 * 60000, a.finished_at - a.started_at), 0);
  const notebook = db.prepare('SELECT * FROM notebook WHERE user_id = ? ORDER BY updated_at DESC').all(u.id);
  const latest = attempts.find(a => a.report);
  return {
    user: { name: u.name, level: u.level, levelLabel: LEVELS[u.level], goals, dailyMinutes: u.daily_minutes, hintStyle: u.hint_style || 'steps', activePath: goals.includes(u.active_path) ? u.active_path : goals[0] },
    paths: goals.map(g => {
      const p = PATHS.find(x => x.id === g);
      return {
        id: p.id, label: p.label, place: p.place,
        missions: pathMissions(g).map(m => ({ ...publicMission(m, u.name), status: missionStatus(m, done), attempts: attempts.filter(a => a.mission_id === m.id).length }))
      };
    }),
    otherPaths: PATHS.filter(p => !goals.includes(p.id)).map(p => ({ id: p.id, label: p.label })),
    activeGoal: json(u.active_goal, null),
    notebook: notebook.map(n => ({ id: n.id, kind: n.kind, title: n.title, sub: n.sub, say: n.say, missionId: n.mission_id, missionTitle: byId(n.mission_id)?.title || '', source: n.source, seen: n.seen, uses: n.uses, status: n.status })),
    history: attempts.map(a => {
      const m = byId(a.mission_id);
      return { id: a.id, missionId: a.mission_id, title: m?.title || a.mission_id, n: m?.n, pathLabel: PATHS.find(p => p.id === m?.path)?.label || '', complete: !!a.complete, turns: a.turns, hintsUsed: a.hints_used, day: a.day, finishedAt: a.finished_at, summary: a.report?.summary || '' };
    }),
    stats: {
      streak: streak(attempts, day), missionsDone: done.size, totalMissions: MISSIONS.length,
      notebookCount: notebook.length + (u.active_goal ? 1 : 0), todayMinutes: Math.round(todayMs / 60000), dailyMinutes: u.daily_minutes,
      practicedToday: attempts.some(a => a.day === day && a.complete)
    },
    skills: latest?.report?.skills || [],
    ai: { ready: hasKey(), mock: isMock() }
  };
}

/* ---------------- auth & profile ---------------- */

app.get('/api/me', route((req, res) => {
  const u = currentUser(req);
  res.json(u ? buildState(u, req.query.today) : { user: null, ai: { ready: hasKey(), mock: isMock() } });
}));

app.post('/api/signup', route((req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const pin = String(req.body.pin || '');
  if (!name) throw new HttpError(400, 'Type your name to continue.');
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, 'Your PIN must be 4 digits.');
  const p = validProfile(req.body, false);
  const key = norm(name);
  if (db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(key)) throw new HttpError(409, 'Someone already uses the name “' + name + '”. Add an initial, like “' + name + ' K”.');
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  const r = db.prepare('INSERT INTO users (name, name_key, pin_hash, level, goals, daily_minutes, hint_style, active_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(display, key, hashPin(pin), p.level, JSON.stringify(p.goals), p.dailyMinutes, p.hintStyle, p.goals[0], now());
  startSession(res, r.lastInsertRowid);
  res.json(buildState(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid), req.body.today));
}));

app.post('/api/login', route((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE name_key = ?').get(norm(req.body.name));
  if (!u || !checkPin(String(req.body.pin || ''), u.pin_hash)) throw new HttpError(401, 'That name and PIN don’t match. Try again.');
  startSession(res, u.id);
  res.json(buildState(u, req.body.today));
}));

app.post('/api/logout', route((req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

app.patch('/api/me', route((req, res) => {
  const u = auth(req);
  const p = validProfile(req.body, true);
  if (req.body.activePath !== undefined) {
    const goals = p.goals || json(u.goals, []);
    if (!goals.includes(req.body.activePath)) throw new HttpError(400, 'Unknown path.');
    p.activePath = req.body.activePath;
  }
  if (p.level !== undefined) db.prepare('UPDATE users SET level = ? WHERE id = ?').run(p.level, u.id);
  if (p.goals) db.prepare('UPDATE users SET goals = ? WHERE id = ?').run(JSON.stringify(p.goals), u.id);
  if (p.dailyMinutes) db.prepare('UPDATE users SET daily_minutes = ? WHERE id = ?').run(p.dailyMinutes, u.id);
  if (p.hintStyle) db.prepare('UPDATE users SET hint_style = ? WHERE id = ?').run(p.hintStyle, u.id);
  if (p.activePath) db.prepare('UPDATE users SET active_path = ? WHERE id = ?').run(p.activePath, u.id);
  res.json(buildState(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), req.body.today));
}));

/* ---------------- missions ---------------- */

function learnerCtx(u) {
  const practice = db.prepare("SELECT title FROM notebook WHERE user_id = ? AND kind = 'practice' AND status != 'mastered' ORDER BY seen DESC, updated_at DESC LIMIT 3").all(u.id).map(r => r.title);
  return { name: u.name, level: u.level, activeGoal: json(u.active_goal, null), practice };
}

app.get('/api/missions/:id', route((req, res) => {
  const u = auth(req);
  const m = byId(req.params.id);
  if (!m) throw new HttpError(404, 'Mission not found.');
  const attempts = attemptsOf(u.id);
  const goal = json(u.active_goal, null);
  const practice = db.prepare("SELECT title, sub FROM notebook WHERE user_id = ? AND kind = 'practice' AND status != 'mastered' ORDER BY seen DESC, updated_at DESC LIMIT 2").all(u.id);
  const reuse = [];
  if (goal) reuse.push({ tag: 'REUSE', text: '“' + goal.tryIt + '” ' + m.character.name + ' will listen for it.' });
  practice.forEach(p => reuse.push({ tag: 'PRACTICE', text: p.title + '. ' + p.sub }));
  reuse.push({ tag: 'NEW', text: m.newPhrase });
  const last = attempts.find(a => a.report?.summary);
  res.json({
    mission: publicMission(m, u.name),
    status: missionStatus(m, completedSet(attempts)),
    pathLabel: PATHS.find(p => p.id === m.path).label,
    reuse,
    personalized: !!(goal || practice.length),
    lastNote: last ? last.report.summary + (goal ? ' This mission gives you a fresh reason to use your notebook phrase.' : '') : '',
    level: LEVELS[u.level]
  });
}));

app.post('/api/attempts', route((req, res) => {
  const u = auth(req);
  const m = byId(req.body.missionId);
  if (!m) throw new HttpError(404, 'Mission not found.');
  if (missionStatus(m, completedSet(attemptsOf(u.id))) === 'locked') throw new HttpError(403, 'Finish the mission before this one first.');
  const log = [{ who: 'jo', text: m.opening }];
  const checklist = Object.fromEntries(m.items.map(i => [i.id, false]));
  const r = db.prepare('INSERT INTO attempts (user_id, mission_id, started_at, log, checklist) VALUES (?, ?, ?, ?, ?)')
    .run(u.id, m.id, now(), JSON.stringify(log), JSON.stringify(checklist));
  res.json({ attemptId: Number(r.lastInsertRowid), mission: publicMission(m, u.name), log, checklist });
}));

function openAttempt(u, id) {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(id, u.id);
  if (!a) throw new HttpError(404, 'This conversation was not found.');
  if (a.finished_at) throw new HttpError(409, 'This conversation has already ended.');
  return { ...a, log: json(a.log, []), checklist: json(a.checklist, {}) };
}

app.post('/api/attempts/:id/turn', route(async (req, res) => {
  const u = auth(req);
  const a = openAttempt(u, req.params.id);
  const m = byId(a.mission_id);
  const text = String(req.body.text || '').trim().slice(0, 400);
  if (!text) throw new HttpError(400, 'Say or type something first.');
  if (a.turns >= 30) throw new HttpError(429, 'This conversation is getting long. End it and review your feedback.');
  const t = await turn(m, learnerCtx(u), a.log, a.checklist, text);
  const log = a.log.concat([t.lineTip ? { who: 'me', text, tip: t.lineTip } : { who: 'me', text }, { who: 'jo', text: t.reply }], t.coach ? [{ who: 'coach', text: t.coach }] : []);
  db.prepare('UPDATE attempts SET log = ?, checklist = ?, turns = ?, hints_used = ? WHERE id = ?')
    .run(JSON.stringify(log), JSON.stringify(t.checklist), a.turns + 1, Math.max(a.hints_used, Number(req.body.hintsUsed) || 0), a.id);
  res.json({ ...t, turns: a.turns + 1 });
}));

app.post('/api/attempts/:id/finish', route(async (req, res) => {
  const u = auth(req);
  const a = openAttempt(u, req.params.id);
  const m = byId(a.mission_id);
  if (!a.log.some(x => x.who === 'me')) {
    db.prepare('DELETE FROM attempts WHERE id = ?').run(a.id);
    throw new HttpError(400, 'Say at least one thing before you end the conversation.');
  }
  const hintsUsed = Math.max(a.hints_used, Number(req.body.hintsUsed) || 0);
  const complete = m.items.every(i => a.checklist[i.id]);
  const wasDone = completedSet(attemptsOf(u.id)).has(m.id);
  const prev = attemptsOf(u.id).find(x => x.report);
  const rep = await report(m, learnerCtx(u), { log: a.log, checklist: a.checklist, complete, turns: a.turns, hintsUsed });

  const t = now();
  const day = isDay(req.body.today) ? req.body.today : dayOf(t);
  db.prepare('UPDATE attempts SET finished_at = ?, day = ?, complete = ?, hints_used = ?, report = ? WHERE id = ?')
    .run(t, day, complete ? 1 : 0, hintsUsed, JSON.stringify(rep), a.id);

  /* Notebook: save new expressions and practice items, merge repeats. */
  const upsert = db.prepare(`INSERT INTO notebook (user_id, kind, key, title, sub, say, mission_id, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, kind, key) DO UPDATE SET seen = seen + 1, sub = excluded.sub, say = excluded.say, mission_id = excluded.mission_id,
      status = CASE WHEN notebook.kind = 'practice' THEN 'new' ELSE notebook.status END, updated_at = excluded.updated_at`);
  rep.expressions.forEach(e => upsert.run(u.id, 'expression', norm(e.phrase), e.phrase, e.example ? 'Example: ' + e.example : e.note, e.example || e.phrase, m.id, 'mission', t, t));
  rep.practice.forEach(p => upsert.run(u.id, 'practice', norm(p.title), p.title, p.sub, p.say, m.id, 'mission', t, t));
  rep.improvedPractice.forEach(title => db.prepare("UPDATE notebook SET status = 'improving', updated_at = ? WHERE user_id = ? AND kind = 'practice' AND key = ?").run(t, u.id, norm(title)));

  /* Active goal: count uses; three uses masters it and the next goal takes over. */
  let goal = json(u.active_goal, null), goalEvent = null;
  if (goal && rep.targetUsed) {
    goal.uses = (goal.uses || 0) + 1;
    goalEvent = { title: goal.title, uses: goal.uses, target: GOAL_TARGET, mastered: goal.uses >= GOAL_TARGET };
    if (goal.uses >= GOAL_TARGET) {
      upsert.run(u.id, 'expression', norm(goal.title), goal.title, 'Mastered: used in ' + GOAL_TARGET + ' missions. Example: ' + goal.tryIt, goal.tryIt, m.id, 'goal', t, t);
      db.prepare("UPDATE notebook SET status = 'mastered' WHERE user_id = ? AND kind = 'expression' AND key = ?").run(u.id, norm(goal.title));
      goal = null;
    }
  } else if (goal) goalEvent = { title: goal.title, uses: goal.uses || 0, target: GOAL_TARGET, mastered: false };
  if (!goal && rep.nextGoal) {
    goal = { ...rep.nextGoal, uses: 0, target: GOAL_TARGET, missionId: m.id, setAt: t };
    goalEvent = { ...(goalEvent || {}), next: goal.title };
  }
  db.prepare('UPDATE users SET active_goal = ? WHERE id = ?').run(goal ? JSON.stringify(goal) : null, u.id);

  /* Compare with the previous mission's skills. */
  const compare = prev ? rep.skills.map(s => {
    const before = prev.report.skills.find(k => k.name === s.name);
    return before ? { name: s.name, before: before.status, after: s.status } : null;
  }).filter(Boolean) : [];
  const nextM = pathMissions(m.path).find(x => x.n === m.n + 1);
  res.json({
    id: a.id, report: rep, complete, turns: a.turns, hintsUsed, drills: {},
    checklist: a.checklist, log: a.log,
    compare: compare.length ? { mission: byId(prev.mission_id)?.title || '', turnsBefore: prev.turns, rows: compare } : null,
    goal: goalEvent,
    unlocked: complete && !wasDone && nextM ? { id: nextM.id, title: nextM.title, followUp: nextM.followUp } : null,
    state: buildState(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), day)
  });
}));

app.get('/api/attempts/:id', route((req, res) => {
  const u = auth(req);
  const a = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(req.params.id, u.id);
  if (!a || !a.finished_at) throw new HttpError(404, 'Report not found.');
  res.json({ id: a.id, missionId: a.mission_id, drills: json(a.drills, {}), report: json(a.report, null), complete: !!a.complete, turns: a.turns, hintsUsed: a.hints_used, log: json(a.log, []), checklist: json(a.checklist, {}) });
}));

/* Practice drills on the feedback screen: the learner repeats a better sentence. */
app.post('/api/attempts/:id/drill', route((req, res) => {
  const u = auth(req);
  const a = db.prepare('SELECT id, drills FROM attempts WHERE id = ? AND user_id = ? AND finished_at IS NOT NULL').get(req.params.id, u.id);
  if (!a) throw new HttpError(404, 'Report not found.');
  const key = String(req.body.key || '').slice(0, 20);
  if (!/^(best|\d+)$/.test(key)) throw new HttpError(400, 'Unknown sentence.');
  const drills = json(a.drills, {});
  const score = Math.max(0, Math.min(100, Math.round(Number(req.body.score) || 0)));
  const prev = drills[key] || { tries: 0, best: 0 };
  drills[key] = { tries: prev.tries + 1, best: Math.max(prev.best, score), last: String(req.body.said || '').slice(0, 300) };
  db.prepare('UPDATE attempts SET drills = ? WHERE id = ?').run(JSON.stringify(drills), a.id);
  res.json({ drills });
}));

/* ---------------- notebook ---------------- */

app.post('/api/notebook', route((req, res) => {
  const u = auth(req);
  const title = String(req.body.title || '').trim().slice(0, 200);
  if (!title) throw new HttpError(400, 'Nothing to save.');
  const t = now();
  db.prepare(`INSERT INTO notebook (user_id, kind, key, title, sub, say, mission_id, source, created_at, updated_at) VALUES (?, 'expression', ?, ?, ?, ?, ?, 'saved', ?, ?)
    ON CONFLICT (user_id, kind, key) DO UPDATE SET updated_at = excluded.updated_at`)
    .run(u.id, norm(title), title, String(req.body.sub || '').slice(0, 300), title, byId(req.body.missionId) ? req.body.missionId : null, t, t);
  const row = db.prepare("SELECT id FROM notebook WHERE user_id = ? AND kind = 'expression' AND key = ?").get(u.id, norm(title));
  res.json({ id: row.id, state: buildState(u, req.body.today) });
}));

app.delete('/api/notebook/:id', route((req, res) => {
  const u = auth(req);
  db.prepare('DELETE FROM notebook WHERE id = ? AND user_id = ?').run(req.params.id, u.id);
  res.json({ state: buildState(u, req.query.today) });
}));

/* ---------------- speech ---------------- */

app.post('/api/transcribe', express.raw({ type: () => true, limit: '12mb' }), route(async (req, res) => {
  const u = auth(req);
  if (!req.body?.length) throw new HttpError(400, 'No audio received.');
  if (isMock()) return res.json({ text: '' });
  const m = byId(req.query.missionId);
  const hint = m ? m.place + '. ' + m.character.name + '. ' + m.board.rows.map(r => r[0]).join(', ') + '. ' + m.model.replace(/\{name\}/g, u.name) : '';
  const text = await transcribe(req.body, req.headers['content-type'] || 'audio/webm', hint);
  res.json({ text });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log('Awen (Counter Talk) running at http://localhost:' + port);
  if (!hasKey()) console.warn('⚠  GROQ_API_KEY is not set. Conversations will not work until you add it to .env (see .env.example).');
  if (isMock()) console.warn('⚠  GROQ_MOCK=1: using canned AI replies for UI testing.');
});
