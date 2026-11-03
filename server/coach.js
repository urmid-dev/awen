import { chatJSON, isMock } from './groq.js';

export const LEVELS = ['Beginner', 'Lower-intermediate', 'Intermediate'];
const LEVEL_STYLE = [
  'The learner is a BEGINNER. Use very short, simple sentences (max 12 words each), common words only, one question at a time.',
  'The learner is LOWER-INTERMEDIATE. Use short, clear sentences and everyday words. One question at a time.',
  'The learner is INTERMEDIATE. Speak naturally like a real person, with normal phrasing and the occasional friendly expression.'
];
export const SKILLS = ['Getting your meaning across', 'Vocabulary', 'Polite requests', 'Full sentences', 'Grammar'];
const STATUSES = ['Strong', 'Getting there', 'Practice next'];
const KINDS = ['Natural', 'Grammar', 'Vocabulary', 'Politeness', 'Say more', 'Word order'];


const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const str = (v, max = 400) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const strList = (v, n, max) => (Array.isArray(v) ? v : []).map(x => str(x, max)).filter(Boolean).slice(0, n);
const transcript = (log, character) => log.map(m =>
  m.who === 'jo' ? character.name + ': ' + m.text : m.who === 'me' ? 'Learner: ' + m.text : '(Coach tip shown to learner: ' + m.text + ')'
).join('\n');

function learnerContext(ctx) {
  const lines = ['Learner name: ' + ctx.name + '.', LEVEL_STYLE[ctx.level] || LEVEL_STYLE[0]];
  if (ctx.activeGoal) lines.push('The learner is practicing this phrase from their notebook: "' + ctx.activeGoal.title + '" (example: "' + ctx.activeGoal.tryIt + '").');
  if (ctx.practice?.length) lines.push('Recurring challenges from earlier missions: ' + ctx.practice.join('; ') + '.');
  return lines.join('\n');
}

function missionContext(m) {
  return [
    'Scene: ' + m.place + '. You are ' + m.character.name + ', the ' + m.character.role + '. Personality: ' + m.character.desc,
    'Facts you know (never invent other facts): ' + m.facts,
    'The learner\'s mission: ' + m.goal,
    'How to run the scene: ' + m.script,
    'Checklist (the mission is complete when every item is true):',
    ...m.items.map(i => '- "' + i.id + '": ' + i.check)
  ].join('\n');
}

/* ---------- One conversation turn ---------- */

export async function turn(m, ctx, log, checklist, text) {
  if (isMock()) return mockTurn(m, log, checklist, text);
  const system = [
    'You run a spoken English role-play for a language learning app. You play a character and also act as a quiet coach.',
    missionContext(m),
    learnerContext(ctx),
    'RULES:',
    '- Stay in character in "reply". Never correct grammar inside the reply; real people just respond. Keep it to 1-2 short sentences that will be read aloud.',
    '- Understand learners generously: accept typos, missing words, wrong grammar and speech-recognition errors if the meaning is clear.',
    '- If the reply is unclear or off-topic, ask a simpler question that helps them (e.g. offer two choices).',
    '- Do not put the answer in the learner\'s mouth: ask open questions ("Anything to drink?", "What size?") instead of naming the exact mission item, unless they are stuck.',
    '- "coach" is a short out-of-character tip (max 25 words) with one example sentence in curly quotes. Give one ONLY when it really helps: the learner chose something different from the mission goal, seems stuck, or used a phrase that could be much more natural. Otherwise use "".',
    '- Mark a checklist item true only when the learner\'s words satisfy it. Items already true stay true.',
    '- When every item is true, the reply must close the scene naturally (confirm and thank them) and "complete" must be true.',
    '- "prompt" is a 3-6 word instruction for what the learner should do next, e.g. "Answer ' + m.character.name + ': what size?".',
    '- "hints" are 3 progressive hints for the learner\'s NEXT reply: [0] a nudge about what to say with 1-2 starter chips, [1] key words with 2-3 word chips, [2] text "Say it like this. Tap to hear it, then try it yourself." with exactly one chip: the full model answer.',
    '- "suggestions" are 2 sample answers the learner could say next: first a natural, polite, complete one; second a short imperfect one a beginner might say that would still be understood.',
    '- Every model answer (hint chips and the first suggestion) must be something a fluent, polite speaker would say: use "I\'d like…", "Could I…", "please"; never "I want" or "give me". Use the exact names from the facts (e.g. "chicken sandwich").',
    '- "lineTip" is quick feedback on the learner\'s LAST line only. If it already sounds natural and correct for this moment (short answers like "Medium, please." count), use null. Otherwise give {"better": the same idea said naturally by a fluent speaker (keep their meaning, keep it short), "why": max 12 words, "kind": one of ' + KINDS.join(', ') + '}. Ignore missing capitals and punctuation; they were speaking. Give a lineTip whenever a fluent speaker would phrase it differently: "I want…" → "I’d like…, please", wrong menu words, a verb a native speaker would not use here ("i search" → "I’m looking for"), missing articles or plurals, word order. Example: learner "i want chicken burger" → {"better":"I’d like a chicken sandwich, please.","why":"“I’d like” is friendlier; the menu says sandwich.","kind":"Politeness"}.',
    'Return JSON only, exactly this shape:',
    '{"lineTip":{"better":"...","why":"...","kind":"..."},"reply":"...","coach":"","understood":true,"heard":"the learner\'s words cleaned of obvious speech-recognition errors","checklist":{' + m.items.map(i => '"' + i.id + '":false').join(',') + '},"complete":false,"prompt":"...","hints":[{"text":"...","chips":["..."]},{"text":"...","chips":["...","..."]},{"text":"Say it like this. Tap to hear it, then try it yourself.","chips":["..."]}],"suggestions":["...","..."]}'
  ].join('\n');
  const user = 'Conversation so far:\n' + transcript(log, m.character) +
    '\n\nChecklist before this reply: ' + JSON.stringify(checklist) +
    '\n\nThe learner just said: "' + text.replace(/"/g, "'") + '"\n\nRespond as ' + m.character.name + '. JSON only.';
  const r = await chatJSON(system, user, { temperature: 0.7, maxTokens: 700 });
  return cleanTurn(r, m, checklist);
}

function cleanTurn(r, m, checklist) {
  const next = { ...checklist };
  const got = r.checklist && typeof r.checklist === 'object' ? r.checklist : {};
  m.items.forEach(i => { if (got[i.id] === true) next[i.id] = true; });
  const hints = (Array.isArray(r.hints) ? r.hints : []).slice(0, 3).map(h => ({ text: str(h?.text, 240), chips: strList(h?.chips, 3, 120) }))
    .filter(h => h.text);
  return {
    reply: str(r.reply, 500) || 'Sorry, could you say that again?',
    coach: str(r.coach, 300),
    understood: r.understood !== false,
    heard: str(r.heard, 500),
    checklist: next,
    complete: m.items.every(i => next[i.id]),
    prompt: str(r.prompt, 80),
    hints: hints.length === 3 ? hints : null,
    lineTip: cleanTip(r.lineTip),
    suggestions: strList(r.suggestions, 3, 160)
  };
}

function cleanTip(t) {
  if (!t || typeof t !== 'object' || !t.better) return null;
  return { better: str(t.better, 240), why: str(t.why, 160), kind: KINDS.includes(t.kind) ? t.kind : 'Natural' };
}

/* ---------- End-of-mission report ---------- */

export async function report(m, ctx, a) {
  if (isMock()) return mockReport(m, a);
  const mine = a.log.filter(x => x.who === 'me').map(x => x.text);
  const system = [
    'You are a warm, expert English speaking coach writing feedback after a role-play mission in a language learning app.',
    missionContext(m),
    learnerContext(ctx),
    'Tone: encouraging, specific, simple English the learner can read. Never say they were wrong; show a better way. Always quote the learner\'s own words so it feels personal.',
    'Return JSON only, exactly this shape:',
    JSON.stringify({
      feedback: { type: 'one of: Say it in one go | Vocabulary | More natural expression | Grammar | Politeness | Your notebook phrase | Next step', suggestion: 'one sentence they could say next time', why: 'one short friendly sentence quoting their words' },
      lines: [{ ok: false, better: 'for EACH learner line in order: how a fluent speaker would say it here', why: 'max 15 words: what changed and why, quoting their words', kind: KINDS.join(' | ') }],
      improved: { better: 'their FIRST sentence rewritten the way a fluent speaker would say it in this scene', why: 'one sentence on what changed and why', perfect: false },
      skills: SKILLS.map(n => ({ name: n, status: 'Strong | Getting there | Practice next', note: 'one sentence, quote their words' })),
      expressions: [{ phrase: 'a reusable pattern from this scene, e.g. “I’d like ___, please.”', example: 'a full example sentence', note: 'when to use it' }],
      practice: [{ title: 'a short name for something to work on, e.g. Naming the exact menu item', sub: 'one sentence: what happened and what to try', say: 'a short phrase to practice saying' }],
      improvedPractice: ['titles from the recurring challenges list that the learner clearly did well this time'],
      targetUsed: false,
      nextGoal: { title: 'one habit to carry into the next mission, naming the phrase in curly quotes, e.g. Use polite openers: “I’d like…” instead of “I want”', why: 'one sentence', tryIt: 'an example sentence' },
      summary: 'one sentence about how this mission went, for the learner\'s history, e.g. You ordered successfully but used “I want” and “burger”.'
    }),
    'Rules: "better" must say everything the mission needed in ONE natural sentence (if their first sentence left something out, add it; that is the "say it in one go" lesson). "perfect" is true only if their first sentence already did that fluently, then "better" repeats it.',
    '"I\'d like…", "Could I have…", "Can I get…" and "May I…" with "please" are all polite and natural; never tell the learner to replace one with another, and count any of them as using a polite-request notebook phrase.',
    'Short answers to a direct question ("Medium, please.", "Yes, please.", "For here.") and short add-ons that continue an order ("And a medium Coke.") are natural English: never mark them as a grammar or full-sentence problem. Judge "Full sentences" mainly on the first, open-ended reply. Model sentences never use "I want".',
    '"lines" must have exactly one entry per learner line, in order. Set "ok": true (and "better" = their line) when it was already natural for that moment.',
    'Only put titles from the learner\'s recurring challenges list in "improvedPractice" (empty if there is no list). Give 1-2 expressions and 0-3 practice items (empty when nothing needs work). "targetUsed" is true only if the learner used their notebook phrase (or a clearly equivalent polite form) at least once. Use the five skill names exactly as given.'
  ].join('\n');
  const user = 'Conversation:\n' + transcript(a.log, m.character) +
    '\n\nLearner lines in order: ' + JSON.stringify(mine) +
    '\nChecklist result: ' + JSON.stringify(a.checklist) + (a.complete ? ' (mission complete)' : ' (the learner ended before finishing)') +
    '\nReplies: ' + a.turns + '. Hints opened: ' + a.hintsUsed + '.\n\nWrite the feedback JSON.';
  // Occasionally a model answers with the wrong shape; one retry nearly always fixes it.
  let r;
  for (let i = 0; i < 2; i++) {
    r = await chatJSON(system, user, { temperature: 0.4, maxTokens: 1600, timeoutMs: 45000, reasoning: 'medium' });
    const skills = Array.isArray(r.skills) ? r.skills.filter(k => k && SKILLS.includes(k.name) && k.note) : [];
    if (skills.length >= 4 && r.feedback?.suggestion && r.improved?.better && Array.isArray(r.lines) && r.lines.length) break;
  }
  return cleanReport(r, a);
}

function cleanReport(r, a) {
  const first = (a.log.find(x => x.who === 'me') || {}).text || '';
  const skills = SKILLS.map(name => {
    const s = (Array.isArray(r.skills) ? r.skills : []).find(k => k && k.name === name) || {};
    return { name, status: STATUSES.includes(s.status) ? s.status : 'Getting there', note: str(s.note, 300) };
  }).filter(s => s.note);
  const hu = a.hintsUsed;
  skills.push(hu === 0
    ? { name: 'Speaking on your own', status: 'Strong', note: 'You finished without opening a hint.' }
    : { name: 'Speaking on your own', status: hu <= 2 ? 'Getting there' : 'Practice next', note: 'You used ' + hu + ' hint' + (hu > 1 ? 's' : '') + '. Next time, try stopping at the first hint level.' });
  const fb = r.feedback || {}, imp = r.improved || {};
  const mine = a.log.filter(x => x.who === 'me');
  const lines = mine.map((x, i) => {
    const l = (Array.isArray(r.lines) ? r.lines[i] : null) || {};
    const better = str(l.better, 240) || x.tip?.better || x.text;
    const ok = l.ok === true || (!l.better && !x.tip) || norm(better) === norm(x.text);
    return { said: x.text, ok, better: ok ? x.text : better, why: ok ? '' : str(l.why, 200) || x.tip?.why || '', kind: ok ? 'Natural' : KINDS.includes(l.kind) ? l.kind : x.tip?.kind || 'Natural' };
  });
  return {
    lines,
    feedback: { type: str(fb.type, 40) || 'Next step', suggestion: str(fb.suggestion, 240), why: str(fb.why, 300) },
    improved: { first, better: str(imp.better, 240) || first, why: str(imp.why, 300), perfect: imp.perfect === true },
    skills,
    expressions: (Array.isArray(r.expressions) ? r.expressions : []).slice(0, 2)
      .map(e => ({ phrase: str(e?.phrase, 120), example: str(e?.example, 200), note: str(e?.note, 200) })).filter(e => e.phrase),
    practice: (Array.isArray(r.practice) ? r.practice : []).slice(0, 3)
      .map(p => ({ title: str(p?.title, 80), sub: str(p?.sub, 240), say: str(p?.say, 160) })).filter(p => p.title),
    improvedPractice: strList(r.improvedPractice, 5, 80),
    targetUsed: r.targetUsed === true,
    nextGoal: r.nextGoal && r.nextGoal.title ? { title: str(r.nextGoal.title, 120), why: str(r.nextGoal.why, 240), tryIt: str(r.nextGoal.tryIt, 200) } : null,
    summary: str(r.summary, 240)
  };
}

/* ---------- Mock mode (GROQ_MOCK=1): canned answers so the UI can be tested without a key ---------- */

function mockTurn(m, log, checklist, text) {
  const next = { ...checklist };
  const todo = m.items.find(i => !next[i.id]);
  if (todo && text.trim().split(/\s+/).length >= 2) next[todo.id] = true;
  const left = m.items.filter(i => !next[i.id]);
  const complete = left.length === 0;
  return {
    reply: complete ? 'Perfect, that’s everything. Thank you!' : 'Got it! And ' + left[0].label.toLowerCase() + '?',
    coach: text.toLowerCase().includes('want') ? 'Try a softer start: “I’d like…, please.”' : '',
    lineTip: /\bi want\b/i.test(text) ? { better: text.replace(/\bI want\b/i, 'I’d like') + (/please/i.test(text) ? '' : ', please'), why: '“I’d like” sounds friendlier than “I want”.', kind: 'Politeness' } : null,
    understood: !!todo && next[todo.id], heard: text, checklist: next, complete,
    prompt: complete ? '' : 'Tell ' + m.character.name + ': ' + (left[0] || {}).label,
    hints: null, suggestions: complete ? [] : [left[0].label + ', please.', left[0].label + '.']
  };
}

function mockReport(m, a) {
  const first = (a.log.find(x => x.who === 'me') || {}).text || '';
  const want = /\bi want\b/i.test(first);
  return cleanReport({
    feedback: { type: want ? 'More natural expression' : 'Next step', suggestion: m.model, why: 'You said “' + first + '”. This version sounds friendly and complete.' },
    improved: { better: m.model, why: 'It names everything in one polite sentence.', perfect: false },
    skills: SKILLS.map((n, i) => ({ name: n, status: STATUSES[i % 3], note: 'Mock note about “' + first + '”.' })),
    expressions: [{ phrase: m.newPhrase.replace(/[“”]/g, ''), example: m.model, note: 'Use it in this kind of situation.' }],
    practice: want ? [{ title: 'Polite requests', sub: 'You said “I want”. Try “I’d like… please”.', say: 'I’d like…, please.' }] : [],
    improvedPractice: [], targetUsed: !want,
    nextGoal: { title: 'Use polite openers: “I’d like…” instead of “I want”', why: 'It sounds friendly in English-speaking places.', tryIt: m.model },
    summary: 'Mock summary: you finished ' + m.title.toLowerCase() + '.'
  }, a);
}
