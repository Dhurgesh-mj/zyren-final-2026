# InterviewLens — Code Walkthrough & Execution Guide

This document explains every layer of the InterviewLens codebase and traces exactly how the code executes at runtime, from a user clicking a button in the browser all the way to a database write and an AI response.

---

## Table of Contents

1. [Project at a Glance](#1-project-at-a-glance)
2. [Repository Layout](#2-repository-layout)
3. [How the Backend Starts](#3-how-the-backend-starts)
4. [Database Layer](#4-database-layer)
5. [REST API Routes](#5-rest-api-routes)
6. [WebSocket Channels](#6-websocket-channels)
7. [AI Engine (Ollama + Llama 3.2)](#7-ai-engine-ollama--llama-32)
8. [AST Code Analyzer](#8-ast-code-analyzer)
9. [Sandboxed Code Execution](#9-sandboxed-code-execution)
10. [Voice Pipeline (Whisper + VAD + TTS)](#10-voice-pipeline-whisper--vad--tts)
11. [Frontend Architecture (Next.js)](#11-frontend-architecture-nextjs)
12. [End-to-End Interview Flow](#12-end-to-end-interview-flow)
13. [Configuration & Environment Variables](#13-configuration--environment-variables)
14. [Running Locally (Step-by-Step)](#14-running-locally-step-by-step)

---

## 1. Project at a Glance

**InterviewLens** is an AI-powered technical interview simulator. A user picks a coding problem, writes a solution in a browser-based IDE, speaks their explanation aloud, and receives:

- Real-time AI follow-up questions from an LLM
- Automatic detection of code patterns (nested loops, recursion, hash maps…)
- A structured scorecard (Technical / Problem Solving / Communication)

**Tech stack summary:**

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TailwindCSS, Monaco Editor |
| Backend API | Python 3.11, FastAPI, Uvicorn |
| AI / LLM | Ollama running Llama 3.2 locally |
| Speech-to-Text | OpenAI Whisper (local inference) |
| Voice Activity | Silero VAD |
| Code Analysis | Python `ast` module + heuristics |
| Sandbox | Docker containers with resource limits |
| Database | SQLite (dev) or PostgreSQL (prod) via SQLAlchemy async |
| Real-time | WebSockets (three independent channels) |

---

## 2. Repository Layout

```
zyren-final/
├── backend/                 ← Python FastAPI server
│   ├── main.py              ← Entry point; wires everything together
│   ├── config.py            ← All settings (env vars → pydantic Settings)
│   ├── api/routes.py        ← REST endpoints (problems, interviews, auth…)
│   ├── websocket/
│   │   ├── code_stream.py   ← WS: receives code edits, returns AST analysis
│   │   ├── voice_stream.py  ← WS: receives audio, returns transcript + TTS
│   │   └── ai_interviewer.py← WS: bidirectional AI conversation
│   ├── ai/
│   │   ├── interviewer.py   ← AIInterviewer class (conversation + follow-ups)
│   │   ├── prompts.py       ← System / follow-up / scoring prompts
│   │   ├── scorecard.py     ← End-of-interview score generator
│   │   └── question_generator.py ← Problem generator via Ollama
│   ├── ast_analyzer/
│   │   └── analyzer.py      ← CodeAnalyzer + PythonASTVisitor
│   ├── stt/
│   │   ├── whisper_stt.py   ← WhisperSTT (loads model, transcribes audio)
│   │   ├── vad.py           ← VoiceActivityDetector (silence detection)
│   │   └── tts.py           ← TTSEngine (optional Coqui TTS)
│   ├── sandbox/
│   │   └── executor.py      ← Docker-based / local code execution
│   └── db/
│       ├── database.py      ← SQLAlchemy async engine + session factory
│       ├── models.py        ← ORM models (User, Interview, Message, …)
│       └── schemas.py       ← Pydantic request/response schemas
│
├── frontend/                ← Next.js application
│   ├── app/
│   │   ├── page.tsx         ← Landing page (problem list)
│   │   ├── interview/page.tsx ← Main interview workspace
│   │   ├── history/         ← Past interviews list
│   │   ├── scorecard/[id]/  ← Detailed scorecard view
│   │   ├── login/ & register/ ← Auth pages
│   │   └── profile/         ← User profile editor
│   ├── components/
│   │   ├── AIChat.tsx       ← Chat panel (messages + typing indicator)
│   │   ├── CodeEditor.tsx   ← Monaco wrapper
│   │   ├── Scorecard.tsx    ← Score visualization
│   │   ├── TestResults.tsx  ← Test case results panel
│   │   ├── VoicePanel.tsx   ← Mic button + recording state
│   │   └── Timer.tsx        ← Elapsed-time counter
│   ├── hooks/
│   │   ├── useWebSocket.ts  ← Reusable WS hook with auto-reconnect
│   │   ├── useVoice.ts      ← MediaRecorder + audio capture
│   │   └── useAIVoice.ts    ← Browser Speech Synthesis (TTS fallback)
│   ├── contexts/
│   │   └── AuthContext.tsx  ← Global auth state (token, user)
│   └── lib/api.ts           ← Typed HTTP + WS client
│
├── docker-compose.yml       ← Orchestrates postgres, ollama, backend, frontend
├── scripts/
│   ├── setup.sh             ← One-shot dev environment bootstrapper
│   └── init_db.sql          ← PostgreSQL schema bootstrap
└── .env.example             ← Template for all environment variables
```

---

## 3. How the Backend Starts

**File:** `backend/main.py`

```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Execution order when the process starts:

1. **Module-level imports** load `config.py` (reads `.env` → populates `Settings`).
2. **`lifespan` async context manager** runs at startup:
   - Calls `engine.begin()` → `Base.metadata.create_all` → creates all DB tables if they don't exist.
   - Checks for the demo user `00000000-0000-0000-0000-000000000001`; inserts it if missing.
   - Yields (application runs).
   - On shutdown: disposes the DB connection pool via `engine.dispose()`.
3. **`FastAPI()` instance** is created with the `lifespan` hook, title, and version.
4. **CORS middleware** is added — permits the frontend origin(s) listed in `settings.CORS_ORIGINS`.
5. **Routers are mounted:**
   - `api_router` → all REST routes under `/api/…`
   - `code_ws_router` → WebSocket at `/ws/code-stream`
   - `voice_ws_router` → WebSocket at `/ws/voice-stream`
   - `ai_ws_router` → WebSocket at `/ws/ai-interviewer`
6. **`GET /health`** is registered as a simple health-check endpoint.

---

## 4. Database Layer

**Files:** `backend/db/database.py`, `backend/db/models.py`, `backend/db/schemas.py`

### Engine setup (`database.py`)

```python
engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

- If `DATABASE_URL` starts with `sqlite`, `check_same_thread=False` is injected (SQLite default for dev).
- If PostgreSQL, `pool_size=20`, `max_overflow=10`, `pool_pre_ping=True` are used.
- `get_db()` is a FastAPI dependency that yields a session, commits on success, rolls back on exception.

### ORM Models (`models.py`)

| Model | Table | Key Columns |
|---|---|---|
| `User` | `users` | id (UUID string), name, email, password_hash, skills (JSON), stats |
| `Interview` | `interviews` | id, user_id (FK), problem (text), language, code_snapshot, scorecard (JSON), status |
| `InterviewMessage` | `interview_messages` | id, interview_id (FK), role (user/assistant), content |
| `CodeSnapshot` | `code_snapshots` | id, interview_id (FK), code, language, analysis (JSON) |
| `GeneratedProblem` | `generated_problems` | id, user_id (FK), title, description, difficulty, starter_code (JSON), test_cases (JSON) |

UUIDs are stored as `String(36)` for SQLite compatibility. Every table uses `utcnow()` for timestamps.

---

## 5. REST API Routes

**File:** `backend/api/routes.py`

All routes are prefixed with `/api` (set in `main.py`).

### Authentication

| Route | What it does |
|---|---|
| `POST /api/auth/register` | Hashes password with SHA-256, inserts `User`, returns a UUID session token |
| `POST /api/auth/login` | Validates credentials, issues a session token stored in `sessions` dict |
| `POST /api/auth/logout` | Removes token from `sessions` dict |
| `GET /api/auth/me` | Looks up user from token, returns profile |

> **Note:** Sessions are stored in a plain Python dict (`sessions = {}`). In production this should be Redis or JWT.

### Problems

| Route | What it does |
|---|---|
| `GET /api/problems` | Returns all `GeneratedProblem` rows for the current user |
| `GET /api/problems/{id}` | Returns one problem by its string ID |
| `POST /api/generate-problem` | Calls Ollama to create a new problem, saves to DB |

### Interview Lifecycle

| Route | What it does |
|---|---|
| `POST /api/start-interview` | Creates an `Interview` row (status=`in_progress`), returns `interview_id` |
| `POST /api/end-interview/{id}` | Sets status=`completed`, calls `generate_scorecard()`, saves scores |
| `GET /api/scorecard/{id}` | Returns the stored scorecard JSON |
| `GET /api/interviews` | Lists all interviews for the user |
| `GET /api/interviews/{id}` | Returns one interview with messages |

### Code Execution

| Route | What it does |
|---|---|
| `POST /api/execute` | Calls `execute_code()` from the sandbox, returns stdout/stderr/time |
| `POST /api/run-tests` | Runs test cases against submitted code, returns pass/fail per case |

---

## 6. WebSocket Channels

Three independent WebSocket connections are opened by the frontend once an interview starts.

### 6.1 Code Stream (`/ws/code-stream`)

```
Frontend (Monaco Editor)  →  code_update  →  Backend
                          ←  analysis     ←  (every 500ms debounced)
Frontend                  →  run_code     →  Backend
                          ←  execution_result ← (Docker sandbox result)
```

**Execution trace:**

1. User types in Monaco Editor → `onChange` fires → `useWebSocket` hook sends:
   ```json
   { "type": "code_update", "code": "...", "language": "python", "interview_id": "..." }
   ```
2. Backend receives it in `_handle_code_update()`.
3. Any pending analysis `asyncio.Task` is **cancelled** (debounce).
4. A new task is scheduled: `await asyncio.sleep(0.5)` then `analyzer.analyze(code, language)`.
5. Analysis result is sent back: `{ "type": "analysis", "data": { patterns_detected: [...], ... } }`.
6. If `interview_id` is set, a `CodeSnapshot` row is saved to the DB.

**Run code trace:**

1. User clicks **Run** → frontend sends `{ "type": "run_code", "code": "...", "language": "python" }`.
2. Backend calls `execute_code()` from the sandbox module.
3. Returns `{ "type": "execution_result", "data": { stdout, stderr, execution_time, exit_code } }`.

### 6.2 AI Interviewer (`/ws/ai-interviewer`)

```
Frontend  →  start_session   →  Backend (creates AIInterviewer instance)
          ←  ai_message      ←  (greeting from Ollama)
Frontend  →  user_message    →  Backend
          ←  ai_message      ←  (Ollama response)
Frontend  →  code_update     →  Backend (triggers follow-up logic)
          ←  follow_up       ←  (contextual question from Ollama)
Frontend  →  transcript      →  Backend (voice transcript forwarded as user_message)
```

**Session state** (`ai_sessions` dict, keyed by WebSocket object `id`):

```python
{
  "websocket": <WebSocket>,
  "interviewer": <AIInterviewer>,    # conversation engine
  "interview_id": "...",
  "last_code": "",
  "last_analysis": {},
  "message_count": 0,
}
```

**Follow-up triggering logic:**

1. On every `code_update`, patterns are compared: `new_patterns - prev_patterns`.
2. Trivial patterns (`no_error_handling`, `global_state`) are filtered out.
3. If meaningful new patterns exist AND cooldown has elapsed (8 s), a question is sent.
4. The AI is asked to phrase the question naturally using `interviewer.chat()`.

### 6.3 Voice Stream (`/ws/voice-stream`)

```
Frontend  →  start_recording   →  Backend
Frontend  →  audio_chunk       →  Backend (base64 PCM chunks)
          ←  vad_status        ←  (speech/silence detection)
          ←  transcript        ←  (Whisper output, when silence detected)
          ←  speech_ended      ←  (full transcript of last utterance)
          ←  ai_response       ←  (Ollama text + optional TTS audio)
Frontend  →  stop_recording    →  Backend
          ←  recording_stopped ←
```

**Per-connection state:** Each connection owns its own `WhisperSTT`, `VoiceActivityDetector`, and `TTSEngine` instances.

---

## 7. AI Engine (Ollama + Llama 3.2)

**Files:** `backend/ai/interviewer.py`, `backend/ai/prompts.py`

### `AIInterviewer` class

```python
class AIInterviewer:
    conversation_history: list[dict]  # Full chat history including system prompt
    code_context: str                 # Latest code snapshot
    last_question_time: float         # Cooldown enforcement
    questions_asked: list[str]        # Dedup last 3–5 questions
    QUESTION_COOLDOWN = 8             # Seconds between auto-questions
```

### Ollama call (`_call_ollama`)

Every AI response is produced by a single HTTP POST:

```python
POST http://localhost:11434/api/chat
{
  "model": "llama3.2",
  "messages": [{"role": "system", "content": "..."}, ...],
  "stream": false,
  "options": { "temperature": 0.7, "top_p": 0.9, "num_predict": 256 }
}
```

The response JSON is `data["message"]["content"]`. On `ConnectError` or `TimeoutException`, a fallback string is returned so the interview can continue.

### System Prompt (`SYSTEM_PROMPT`)

Instructs Llama 3.2 to behave as a calm senior engineer who:
- Only asks questions at the right moment (finished explaining, code looks inefficient, long silence).
- Keeps answers to 2–4 sentences.
- Never gives away the answer.

### Follow-up Decision (`FOLLOW_UP_PROMPT`)

A second prompt format is used when deciding whether to ask a follow-up. The model must reply with either:
- `ASK: <question>` — the follow-up question text
- `WAIT: <reason>` — the model decided not to interrupt

The backend parses the prefix with `response.startswith("ASK:")`.

### Scorecard Generation (`SCORECARD_PROMPT`)

At interview end, the final code, conversation history, and voice transcript are sent together. The model returns a **strict JSON object**:

```json
{
  "technical_score": 8,
  "problem_solving_score": 7,
  "communication_score": 9,
  "feedback": "...",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "detailed_feedback": { "technical": "...", "problem_solving": "...", "communication": "..." }
}
```

If JSON parsing fails, a default scorecard is returned so the flow never breaks.

---

## 8. AST Code Analyzer

**File:** `backend/ast_analyzer/analyzer.py`

`CodeAnalyzer.analyze(code, language)` dispatches to:

### Python Analysis (`_analyze_python`)

1. Calls `ast.parse(code)` — raises `SyntaxError` on bad code (pattern `syntax_error` returned).
2. Walks the AST with `PythonASTVisitor(ast.NodeVisitor)`, which tracks:

| Visitor Method | What it detects |
|---|---|
| `visit_FunctionDef` / `visit_AsyncFunctionDef` | Function names, current function scope |
| `visit_For` / `visit_While` | Loop depth, nested loops (depth ≥ 2) |
| `visit_Call` | Recursion (calls to own function names), `sorted()`, `dict()` |
| `visit_Try` / `visit_If` | Error handling present |
| `visit_ListComp` | List comprehension usage |
| `visit_Dict` / `visit_DictComp` | Dictionary usage |
| `visit_Global` / top-level `visit_Assign` | Global variables |

3. Patterns are mapped to **complexity hints** and **suggested questions** the AI may ask.

### JavaScript Analysis (`_analyze_javascript`)

Because Python's `ast` module only parses Python, JavaScript is analysed with **heuristic line scanning**:
- Function detection: lines starting with `function ` or `const/let … => `.
- Loop detection: lines containing `for `, `while ` — depth tracked with `{` counting.
- Recursion: function names reappearing as calls.
- Sort: `.sort(` in code.
- Hash map: `new Map(`, `new Set(`, `{}`.

Return shape is identical to the Python path.

---

## 9. Sandboxed Code Execution

**File:** `backend/sandbox/executor.py`

### Docker path (when `SANDBOX_ENABLED=true`)

```python
container = client.containers.run(
    image="python:3.11-slim",   # or node:20-slim for JavaScript
    command=["python", "-c", code],
    mem_limit="128m",
    cpu_quota=50000,            # 50% of one CPU
    network_disabled=True,      # No internet
    read_only=True,             # No filesystem writes
    tmpfs={"/tmp": "size=10M"}, # Small writable /tmp
    security_opt=["no-new-privileges:true"],
    user="nobody",
)
result = container.wait(timeout=5)
stdout = container.logs(stdout=True, stderr=False)
stderr = container.logs(stdout=False, stderr=True)
container.remove(force=True)   # Always cleaned up in finally block
```

Supported languages and their images:

| Language | Docker Image | Command |
|---|---|---|
| Python | `python:3.11-slim` | `python -c <code>` |
| JavaScript | `node:20-slim` | `node -e <code>` |
| Java | `eclipse-temurin:17-jdk` | `echo <code> > Main.java && javac Main.java && java Main` |
| C++ | `gcc:13` | `echo <code> > main.cpp && g++ -o main main.cpp && ./main` |
| C | `gcc:13` | `echo <code> > main.c && gcc -o main main.c && ./main` |
| Go | `golang:1.21` | wraps code in `package main / func main(){}` → `go run main.go` |
| Rust | `rust:1.75` | wraps code in `fn main(){}` → `rustc main.rs && ./main` |
| TypeScript | `node:20-slim` | `tsc main.ts && node main.js` |

### Local fallback (when Docker is unavailable)

Falls back to `subprocess.run(["python3", "-c", code], timeout=5)`. This is less secure and only intended for development.

Both paths return the same dict:
```python
{ "stdout": "...", "stderr": "...", "execution_time": 0.123, "exit_code": 0, "timed_out": False }
```

---

## 10. Voice Pipeline (Whisper + VAD + TTS)

**Files:** `backend/stt/whisper_stt.py`, `backend/stt/vad.py`, `backend/stt/tts.py`

### Voice Activity Detection (`VoiceActivityDetector`)

- Uses **Silero VAD** (or a heuristic fallback based on audio energy).
- Accumulates PCM audio chunks.
- Detects speech end when silence exceeds `silence_threshold` (default 1.5 s).
- Returns `{ "is_speaking": bool, "speech_ended": bool, "silence_duration": float }`.

### Speech-to-Text (`WhisperSTT`)

- Loads OpenAI Whisper model (default size: `base`) on first use.
- `transcribe_audio(audio_bytes)`: decodes raw bytes to a float32 numpy array → passes to `whisper.transcribe()`.
- Returns the transcribed text string.

### Text-to-Speech (`TTSEngine`)

- Optional — uses **Coqui TTS** if the package is installed.
- `synthesize_speech(text)` → returns WAV bytes, or `None` if TTS is unavailable.
- The frontend has a built-in **Web Speech API** fallback (`useAIVoice` hook) so TTS works even without Coqui.

### Full voice-to-voice trace

```
Browser mic  →  MediaRecorder  →  base64 audio chunks (WebSocket)
                                       ↓
                               VoiceActivityDetector
                                       ↓ (silence > 1.5s)
                               WhisperSTT.transcribe_audio()
                                       ↓
                          transcript → AI Interviewer.chat()
                                       ↓
                               Ollama → response text
                                       ↓
                          (optional) TTSEngine.synthesize_speech()
                                       ↓
                     base64 WAV audio → Frontend WebSocket → AudioContext.play()
```

---

## 11. Frontend Architecture (Next.js)

### Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing page; fetches and lists problems from `/api/problems` |
| `/interview?problem=<id>` | `app/interview/page.tsx` | Main workspace (editor + AI chat + voice) |
| `/history` | `app/history/page.tsx` | Lists past `Interview` records |
| `/scorecard/[id]` | `app/scorecard/[id]/page.tsx` | Renders a specific interview scorecard |
| `/login` & `/register` | respective `page.tsx` | Auth forms |
| `/profile` | `app/profile/page.tsx` | Profile editor |

### Key Components

**`CodeEditor.tsx`** — wraps `@monaco-editor/react` with:
- Dynamic import (`ssr: false`) to avoid server-side rendering issues.
- `Ctrl/Cmd + Enter` shortcut wired to run code.
- Auto-layout and smooth animations enabled.

**`AIChat.tsx`** — stateless display component:
- Renders `messages[]` as chat bubbles (user right, assistant left).
- Shows animated typing dots when `isTyping=true`.
- Colour-coded pattern badges (`nested_loops`, `recursion`, etc.) displayed above the chat.

**`VoicePanel.tsx`** — microphone UI:
- Uses the `useVoice` hook (`MediaRecorder` API).
- Streams audio chunks over the `/ws/voice-stream` WebSocket.

### Hooks

**`useWebSocket.ts`** — reusable WebSocket manager:
- Connects on mount, auto-reconnects on disconnect if `reconnect: true`.
- Exposes `sendMessage(data)` and invokes `onMessage(msg)` callback on receipt.
- Handles JSON serialization / deserialization.

**`useVoice.ts`** — microphone capture:
- Requests `getUserMedia({ audio: true })`.
- Creates a `MediaRecorder`, collects `Blob` chunks, converts to base64, sends via WS.

**`useAIVoice.ts`** — browser TTS fallback:
- Uses `window.speechSynthesis` to speak AI responses aloud when the server-side TTS is unavailable.

### Auth Context (`AuthContext.tsx`)

Stores `{ user, token, isAuthenticated }` in React state, persisted to `localStorage`.  
Exposes `login()`, `logout()`, `register()` helpers used across pages.

### API Client (`lib/api.ts`)

- All HTTP requests use **relative URLs** (e.g., `/api/problems`) so they are automatically proxied by the Next.js dev server to `http://localhost:8000`.
- WebSocket URLs point directly at port 8000 (bypassing the Next.js proxy).
- Typed `Problem`, `Interview`, `Scorecard`, `ExecutionResult`, `ASTAnalysis` types are co-located here.

---

## 12. End-to-End Interview Flow

Below is the complete trace of a single interview session from start to finish.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 1 — User visits / (landing page)                                         │
│  • fetch('/api/problems') → GET /api/problems → DB query → problem list JSON   │
│  • Problems rendered as cards                                                  │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 2 — User clicks a problem card                                           │
│  • Next.js routes to /interview?problem=<id>                                   │
│  • fetch('/api/problems/<id>') → loads problem details + starter code          │
│  • Monaco Editor populated with starter_code                                   │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 3 — User clicks "Start Interview"                                        │
│  • POST /api/start-interview → creates Interview row (status=in_progress)      │
│  • Returns interview_id                                                        │
│  • Three WebSockets opened in parallel:                                        │
│    - /ws/code-stream      (code analysis)                                      │
│    - /ws/ai-interviewer   (AI conversation)                                    │
│    - /ws/voice-stream     (voice input/output)                                 │
│  • AI WS: send start_session → AIInterviewer.get_initial_greeting() → Ollama  │
│  • Greeting message displayed in chat panel                                    │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 4 — User writes code                                                     │
│  • Every keystroke → code_update → debounced 500ms → AST analysis             │
│  • analysis result → patterns shown as badges in AI chat panel                │
│  • If new meaningful pattern detected (and cooldown elapsed):                  │
│    - AI WS: code_update → _handle_code_update                                 │
│    - New pattern compared to previous → if changed → AIInterviewer.chat()     │
│    - Ollama generates a contextual follow-up question                          │
│    - follow_up message sent to frontend → displayed in chat                   │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 5 — User speaks their explanation (or types in chat)                     │
│                                                                                │
│  Text path:                                                                    │
│    • User types → Send button → AI WS: user_message                           │
│    • AIInterviewer.chat(user_message, code, ast_analysis)                     │
│    • Message enriched with current code context → sent to Ollama              │
│    • Response stored in conversation_history → sent to frontend                │
│                                                                                │
│  Voice path:                                                                   │
│    • User clicks mic → MediaRecorder starts                                    │
│    • Audio chunks → base64 → Voice WS: audio_chunk                            │
│    • VoiceActivityDetector accumulates chunks                                  │
│    • Silence detected → WhisperSTT.transcribe_audio()                         │
│    • Transcript → AI Interviewer.chat() (same path as text)                   │
│    • AI response text → (optional) TTSEngine.synthesize_speech() → audio WS  │
│    • Browser plays back AI voice response                                      │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 6 — User clicks "Run Code"                                               │
│  • Code WS: run_code → sandbox.executor.execute_code(code, language)          │
│  • If SANDBOX_ENABLED: Docker container spawned, stdout captured, destroyed   │
│  • If SANDBOX_ENABLED=false: subprocess.run() fallback                        │
│  • execution_result sent back → terminal output shown in Output panel         │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 7 — User clicks "End Interview"                                          │
│  • POST /api/end-interview/<id> with { code_snapshot, transcript }            │
│  • ai.scorecard.generate_scorecard() called:                                  │
│    - Sends code + conversation + transcript to Ollama (SCORECARD_PROMPT)      │
│    - Parses JSON from response                                                 │
│    - Calculates overall_score = mean(technical, problem_solving, communication)│
│  • Interview row updated: status=completed, scores saved, feedback stored     │
│  • Frontend navigates to /scorecard/<id>                                       │
└────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│  STEP 8 — Scorecard page                                                       │
│  • GET /api/scorecard/<id> → returns stored scorecard JSON                    │
│  • Scorecard.tsx renders bar charts for each dimension                        │
│  • Strengths, improvements, and detailed feedback displayed                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Configuration & Environment Variables

All settings live in `backend/config.py` as a Pydantic `Settings` class, loaded from `.env`.

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `InterviewLens` | Application name |
| `APP_VERSION` | `1.0.0` | Version string |
| `DEBUG` | `True` | Enables SQLAlchemy query logging |
| `DATABASE_URL` | `sqlite+aiosqlite:///./interviewlens.db` | Async DB URL |
| `DATABASE_URL_SYNC` | `sqlite:///./interviewlens.db` | Sync DB URL (Alembic) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `llama3.2` | LLM model name |
| `WHISPER_MODEL` | `base` | Whisper model size (`tiny` → `large`) |
| `SANDBOX_ENABLED` | `False` | Use Docker sandbox for code execution |
| `SANDBOX_TIMEOUT` | `5` | Seconds before container is killed |
| `SANDBOX_MEMORY_LIMIT` | `128m` | Docker memory limit per run |
| `SANDBOX_CPU_LIMIT` | `0.5` | CPU fraction (0.5 = 50%) |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed frontend origins |
| `SECRET_KEY` | *(change in prod)* | JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime |

Copy `.env.example` to `.env` and override as needed before starting the backend.

---

## 14. Running Locally (Step-by-Step)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (optional, for sandboxed execution)
- [Ollama](https://ollama.com) installed and running

### Step 1 — Pull the LLM

```bash
ollama pull llama3.2
```

This downloads Llama 3.2 (~2 GB). It must be running before starting the backend.

### Step 2 — Backend setup

```bash
cd zyren-final/backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env     # Edit .env as needed
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

On first start, `interviewlens.db` (SQLite) is created automatically.

### Step 3 — Frontend setup

```bash
cd zyren-final/frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

### Step 4 — Full Docker Compose (alternative)

To run the entire stack (PostgreSQL + Ollama + backend + frontend) in containers:

```bash
cd zyren-final
docker compose up
```

Services:
- PostgreSQL → `localhost:5432`
- Ollama → `localhost:11434`
- Backend → `localhost:8000` (API docs: `http://localhost:8000/docs`)
- Frontend → `localhost:3000`

### Verifying everything works

```bash
# Health check
curl http://localhost:8000/health
# → {"status":"healthy","service":"InterviewLens","version":"1.0.0"}

# List problems (should return seeded problems or empty array)
curl http://localhost:8000/api/problems
```

---

*This walkthrough covers all layers of InterviewLens — from user interaction in the browser to database writes, AI inference via Ollama, real-time code analysis, Docker sandbox execution, and structured scorecard generation.*
