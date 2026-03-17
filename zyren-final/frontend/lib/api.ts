/**
 * API client for InterviewLens backend.
 * Uses relative URLs so requests go through Next.js rewrites proxy.
 * This avoids CORS issues in local development.
 */

// For server-side or build, use env var; for browser, use relative paths
const API_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  : '';  // Empty string = relative URL (proxied via Next.js rewrites)

function getWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8000';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // WebSocket goes directly to backend on port 8000
  return process.env.NEXT_PUBLIC_WS_URL || `${proto}//${window.location.hostname}:8000`;
}

export const api = {
  get baseUrl() { return API_URL; },
  get wsUrl() { return getWsUrl(); },

  async fetch(path: string, options: RequestInit = {}) {
    const url = `${API_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || 'API request failed');
    }
    return res.json();
  },

  // Problems
  async getProblems() {
    return this.fetch('/api/problems');
  },

  async getProblem(id: string) {
    return this.fetch(`/api/problems/${id}`);
  },

  // Interviews
  async startInterview(data: { problem: string; problem_title: string; language: string }) {
    return this.fetch('/api/start-interview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async endInterview(interviewId: string, data: { code_snapshot?: string; transcript?: string }) {
    return this.fetch(`/api/end-interview/${interviewId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getScorecard(interviewId: string) {
    return this.fetch(`/api/scorecard/${interviewId}`);
  },

  async getInterviews() {
    return this.fetch('/api/interviews');
  },

  async getInterview(id: string) {
    return this.fetch(`/api/interviews/${id}`);
  },

  // Code execution
  async executeCode(data: { code: string; language: string; stdin?: string }) {
    return this.fetch('/api/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // WebSocket connections
  createCodeStreamWS() {
    return new WebSocket(`${getWsUrl()}/ws/code-stream`);
  },

  createVoiceStreamWS() {
    return new WebSocket(`${getWsUrl()}/ws/voice-stream`);
  },

  createAIInterviewerWS() {
    return new WebSocket(`${getWsUrl()}/ws/ai-interviewer`);
  },
};

export type Problem = {
  id: string;
  title: string;
  difficulty: string;
  description: string;
  starter_code?: Record<string, string>;
  test_cases?: Array<{ input: string; expected: string }>;
};

export type Interview = {
  id: string;
  user_id: string;
  problem: string;
  problem_title: string;
  language: string;
  status: string;
  started_at: string;
  code_snapshot?: string;
  transcript?: string;
};

export type Scorecard = {
  interview_id: string;
  technical_score: number;
  problem_solving_score: number;
  communication_score: number;
  overall_score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  detailed_feedback: Record<string, string>;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  execution_time: number;
  exit_code: number;
  timed_out: boolean;
};

export type ASTAnalysis = {
  patterns_detected: string[];
  complexity_hints: string[];
  suggested_questions: string[];
  functions: string[];
  classes: string[];
  imports: string[];
  loops: number;
  recursion_detected: boolean;
  nested_loops_detected: boolean;
};
