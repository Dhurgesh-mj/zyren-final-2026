# InterviewLens — AI Technical Interview Simulator

<div align="center">

**Practice technical interviews with an AI interviewer that watches your code, listens to your explanations, asks dynamic follow-up questions, and generates detailed scorecards.**

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-teal?style=flat-square&logo=fastapi)
![Ollama](https://img.shields.io/badge/Ollama-Llama_3.2-blue?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql)

</div>

---

## 🚀 Features

- **🖥️ Live Coding** — Monaco Editor with syntax highlighting, code execution, and real-time streaming
- **🤖 AI Interviewer** — Powered by Llama 3.2 via Ollama, asks contextual follow-up questions
- **🎤 Voice Interaction** — Whisper STT + Silero VAD for real-time voice conversation
- **🔍 AST Code Analysis** — Detects patterns (nested loops, recursion, brute force) and triggers questions
- **🐳 Sandboxed Execution** — Docker containers with CPU/memory limits and timeout enforcement
- **📊 Interview Scorecard** — Structured evaluation across Technical, Problem Solving, and Communication
- **📝 Interview History** — Track progress across sessions with detailed feedback

## 🏗️ Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐     HTTP      ┌──────────┐
│   Frontend   │ ◄──────────────► │   Backend     │ ◄───────────► │  Ollama  │
│  (Next.js)   │                  │   (FastAPI)   │               │ (Llama)  │
│              │                  │               │               └──────────┘
│ Monaco Editor│ ◄── code_stream  │ AST Analyzer  │
│ AI Chat      │ ◄── ai_interview │ AI Engine     │     ┌──────────────┐
│ Voice Panel  │ ◄── voice_stream │ STT (Whisper) │     │  PostgreSQL  │
│ Scorecard    │                  │ Sandbox       │ ◄──►│  (Database)  │
└─────────────┘                   └──────────────┘     └──────────────┘
```

## 📁 Project Structure

```
interviewlens/
├── frontend/                    # Next.js 15 + TailwindCSS
│   ├── app/
│   │   ├── page.tsx             # Landing page
│   │   ├── interview/page.tsx   # Interview workspace
│   │   ├── history/page.tsx     # Past interviews
│   │   └── scorecard/[id]/      # Scorecard detail
│   ├── components/
│   │   ├── CodeEditor.tsx       # Monaco Editor wrapper
│   │   ├── AIChat.tsx           # AI conversation panel
│   │   ├── VoicePanel.tsx       # Voice recording UI
│   │   ├── Scorecard.tsx        # Score visualization
│   │   └── Timer.tsx            # Interview timer
│   ├── hooks/
│   │   ├── useWebSocket.ts      # Reusable WS hook
│   │   └── useVoice.ts          # Voice recording hook
│   └── lib/
│       └── api.ts               # API client
│
├── backend/                     # Python FastAPI
│   ├── main.py                  # App entry point
│   ├── config.py                # Settings management
│   ├── api/
│   │   └── routes.py            # REST endpoints
│   ├── websocket/
│   │   ├── code_stream.py       # Code streaming WS
│   │   ├── voice_stream.py      # Voice streaming WS
│   │   └── ai_interviewer.py    # AI conversation WS
│   ├── ai/
│   │   ├── interviewer.py       # AI engine (Ollama)
│   │   ├── scorecard.py         # Scorecard generator
│   │   └── prompts.py           # System prompts
│   ├── ast_analyzer/
│   │   └── analyzer.py          # Python/JS AST analysis
│   ├── stt/
│   │   ├── whisper_stt.py       # Whisper transcription
│   │   └── vad.py               # Silero VAD
│   ├── sandbox/
│   │   └── executor.py          # Docker sandbox
│   └── db/
│       ├── database.py          # Async SQLAlchemy
│       ├── models.py            # ORM models
│       └── schemas.py           # Pydantic schemas
│
├── docker/
│   ├── Dockerfile.sandbox       # Sandbox container
│   └── sandbox_runner.py        # Execution script
│
├── scripts/
│   ├── setup.sh                 # Setup script
│   └── init_db.sql              # Database schema
│
├── docker-compose.yml           # Service orchestration
├── .env.example                 # Environment template
└── README.md                    # This file
```

## 🛠️ Prerequisites

- **Docker** & Docker Compose
- **Node.js** 18+
- **Python** 3.11+
- **Ollama** (for local LLM)

## ⚡ Quick Start

### 1. Clone and Setup

```bash
cd interviewlens
cp .env.example .env
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 2. Pull the Llama 3.2 Model

```bash
ollama pull llama3.2
```

### 3. Start Infrastructure (PostgreSQL + Ollama)

```bash
docker compose up postgres ollama -d
```

### 4. Start the Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 6. Open the App

Visit **http://localhost:3000**

## 🐳 Docker Compose (Full Stack)

```bash
docker compose up
```

This starts:
- **PostgreSQL** on port `5432`
- **Ollama** on port `11434`
- **Backend** on port `8000`
- **Frontend** on port `3000`

## 📡 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/problems` | List coding problems |
| `GET` | `/api/problems/{id}` | Get problem details |
| `POST` | `/api/start-interview` | Start interview session |
| `POST` | `/api/end-interview/{id}` | End interview + generate scorecard |
| `GET` | `/api/scorecard/{id}` | Get scorecard |
| `POST` | `/api/execute` | Execute code in sandbox |
| `GET` | `/api/interviews` | List all interviews |
| `GET` | `/api/interviews/{id}` | Get interview details |
| `GET` | `/health` | Health check |

### WebSocket Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ws/code-stream` | Real-time code streaming + AST analysis |
| `/ws/voice-stream` | Voice audio streaming + VAD + STT |
| `/ws/ai-interviewer` | AI conversation management |

## 🎯 Interview Flow

```
1. User selects a problem from the landing page
2. User clicks "Start Interview"
3. AI interviewer sends greeting + asks for approach
4. User writes code in Monaco Editor
   → Code streamed to backend via WebSocket
   → AST analysis runs on each change (debounced)
5. AI detects patterns and asks follow-up questions
   → e.g., "I see nested loops. What's the time complexity?"
6. User responds via text or voice
   → Voice → Silero VAD → Whisper STT → AI
7. User clicks "Run" to execute code in Docker sandbox
8. User clicks "End Interview"
   → AI generates structured scorecard
   → Scores: Technical (1-10), Problem Solving (1-10), Communication (1-10)
```

## 🔧 Configuration

All settings are managed via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async DB connection |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | LLM model name |
| `WHISPER_MODEL` | `base` | Whisper model size |
| `SANDBOX_TIMEOUT` | `5` | Code execution timeout (seconds) |
| `SANDBOX_MEMORY_LIMIT` | `128m` | Container memory limit |

## 📋 Scorecard Format

```json
{
  "technical_score": 8,
  "problem_solving_score": 7,
  "communication_score": 9,
  "overall_score": 8.0,
  "feedback": "Strong algorithm choice with clear explanation...",
  "strengths": ["Efficient hash map usage", "Clear communication"],
  "improvements": ["Consider edge cases", "Discuss space complexity"],
  "detailed_feedback": {
    "technical": "Good use of hash maps for O(1) lookups...",
    "problem_solving": "Identified the core problem quickly...",
    "communication": "Explained approach clearly..."
  }
}
```

## 🧪 Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15, TailwindCSS, Monaco Editor |
| Backend | Python FastAPI, WebSockets |
| AI | Ollama + Llama 3.2 |
| STT | OpenAI Whisper (local) |
| VAD | Silero VAD |
| Code Analysis | Python AST, Tree-sitter |
| Sandbox | Docker containers |
| Database | PostgreSQL + SQLAlchemy (async) |

## 📄 License

MIT
