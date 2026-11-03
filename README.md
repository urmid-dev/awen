# Awen

*Counter Talk*

Speaking practice for English learners: short real-life missions with an AI character, three-step hints, AI feedback, and a notebook that carries what you learn into the next mission. Built from the Counter Talk prototype, with the same design.

## Run it

Requires Node.js 24 (uses the built-in `node:sqlite`).

```bash
cd counter-talk
npm install
cp .env.example .env      # then paste your Groq key into GROQ_API_KEY
npm start                 # http://localhost:3000
```

Get a key at https://console.groq.com/keys. To click through the UI without a key, set `GROQ_MOCK=1` in `.env` (canned replies, no real AI).

## What works

| Area | How it works |
| --- | --- |
| Accounts | Name + 4-digit PIN (hashed with scrypt), cookie session. “I already have an account” signs in on any device. |
| Onboarding | Level, goals (5 learning paths) and daily minutes are saved and editable from Progress. Level changes how the character talks. |
| Missions | 15 missions: Ordering food, Shopping, Asking directions, Hotel check-in, Chatting with a friend (3 each). Each unlocks the next. Defined as data in `server/missions.js`. |
| Conversation | Groq LLM plays the character, tracks the checklist, decides when the mission is complete, adds coach tips, and writes fresh hints and suggested answers for every turn. |
| Voice | Mic audio is recorded in the browser and transcribed with Groq Whisper (works in every modern browser, not just Chrome). The character speaks with the browser’s text-to-speech; slow-voice and replay buttons. |
| Hints | Learners choose **step by step** (nudge → key words → full sentence) or **full answer right away**, in onboarding or Preferences, and can switch inside any hint. Hints open automatically when the learner seems stuck. Tapping a chip hears it and adds it to the answer. |
| Feedback (core) | **Live line tips**: right after each learner line, a “say it more naturally” tip with the reason and type (politeness, vocabulary, grammar…), or nothing when it was already natural.<br>**Sentence-by-sentence review** after the mission: every line, a better version, why, and a natural/needs-work tag, plus “say it all in one go”.<br>**Try it**: the learner says (or types) the better sentence; it is checked word by word (missed words highlighted, contractions understood) and the best score is saved.<br>Also: skill ratings, comparison with the previous mission, notebook updates. |
| Notebook | Expressions, things to practice (recurring ones are counted), saved phrases, mission history. An active goal is carried into the next missions and counted until it is used 3 times. |
| Progress | Day streak, missions done, today’s minutes against the daily goal, latest skills, full history with past reports. |

## Configuration (`.env`)

| Variable | Default | |
| --- | --- | --- |
| `GROQ_API_KEY` | | Required |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Any Groq chat model with JSON mode |
| `GROQ_BACKUP_MODEL` | `openai/gpt-oss-20b` | Used automatically when the main model hits its per-minute limit (the free plan allows 8,000 tokens/min per model) |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` | Speech-to-text model |
| `PORT` | `3000` | |
| `DB_FILE` | `data/counter-talk.db` | SQLite file |
| `GROQ_MOCK` | `0` | `1` = canned replies for UI testing |

The microphone needs `localhost` or HTTPS. To deploy, put it behind HTTPS (any Node host works; mount a disk for the SQLite file).

## Code map

- `server/index.js`: API routes (auth, missions, conversation turns, reports, notebook, transcription) and progress logic
- `server/coach.js`: prompts for the character and the feedback report, plus output validation
- `server/groq.js`: Groq chat (JSON mode) and Whisper calls
- `server/missions.js`: mission catalog
- `server/db.js`: SQLite schema
- `public/app.js`: the whole client (screens, recording, speech, state)
- `public/styles.css`: design tokens and components from the prototype

## Deploy on Railway

1. Push this folder to a GitHub repository (`.env` and the database are git-ignored, so your key is never uploaded).
2. In Railway: **New Project → Deploy from GitHub repo** and pick the repository.
3. **Variables:** add `GROQ_API_KEY`, and `DB_FILE=/data/awen.db`.
4. **Volume:** right-click the service → **Attach volume**, mount path `/data`, so accounts and progress survive redeploys.
5. **Settings → Networking → Generate Domain** to get a public HTTPS URL (the microphone needs HTTPS).

Railway sets `PORT` itself and runs `npm start`.
