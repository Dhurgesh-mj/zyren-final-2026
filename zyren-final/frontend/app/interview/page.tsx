'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Brain, Play, Square, Terminal as TerminalIcon,
  X, AlertTriangle, CheckCircle, ArrowLeft,
  Mic, MicOff, Radio, Send, Bot, User,
  Sparkles, Clock, ChevronDown, Code2,
  Eye, EyeOff, Zap, Activity
} from 'lucide-react';
import { api, type Problem, type ASTAnalysis, type ExecutionResult } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useVoice } from '@/hooks/useVoice';
import dynamic from 'next/dynamic';
import Scorecard from '@/components/Scorecard';
import TestResults from '@/components/TestResults';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
};

// ─── Timer Component (inline) ────────────────────────────
function Timer({ isRunning }: { isRunning: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const iv = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [isRunning]);
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return (
    <span className="font-mono text-xs text-white/60">{m}:{s}</span>
  );
}

function InterviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const problemId = searchParams.get('problem') || 'two-sum';

  // ─── State ─────────────────────────────────────────────
  const [problem, setProblem] = useState<Problem | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'active' | 'ending' | 'completed'>('idle');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState<'python' | 'javascript'>('python');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAITyping, setIsAITyping] = useState(false);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [output, setOutput] = useState<ExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [showProblem, setShowProblem] = useState(true);
  const [scorecard, setScorecard] = useState<any>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [liveIndicator, setLiveIndicator] = useState(false);
  
  // Test runner state
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const transcriptRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [chatInput, setChatInput] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAITyping]);

  // ─── Load Problem ──────────────────────────────────────
  useEffect(() => {
    api.getProblem(problemId)
      .then((p) => {
        setProblem(p);
        setCode(p.starter_code?.[language] || '# Write your solution here\n');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [problemId]);

  // ─── WebSocket: Code Stream ────────────────────────────
  const codeWS = useWebSocket(
    `${api.wsUrl}/ws/code-stream`,
    {
      onMessage: (msg) => {
        if (msg.type === 'analysis') {
          setPatterns(msg.data?.patterns_detected || []);
          // Flash the live indicator
          setLiveIndicator(true);
          setTimeout(() => setLiveIndicator(false), 800);
        }
        if (msg.type === 'execution_result') {
          setOutput(msg.data);
          setIsRunning(false);
          setShowOutput(true);
        }
      },
      reconnect: true,
    }
  );

  // ─── WebSocket: AI Interviewer ─────────────────────────
  const aiWS = useWebSocket(
    `${api.wsUrl}/ws/ai-interviewer`,
    {
      onMessage: (msg) => {
        if (msg.type === 'ai_message' || msg.type === 'follow_up') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: msg.content,
            timestamp: Date.now(),
          }]);
          setIsAITyping(false);
        }
        if (msg.type === 'ai_typing') {
          setIsAITyping(msg.status);
        }
      },
      reconnect: true,
    }
  );

  // ─── Voice ────────────────────────────────────────────
  const voice = useVoice({
    wsUrl: `${api.wsUrl}/ws/voice-stream`,
    interviewId: interviewId || undefined,
    onTranscript: (text) => {
      transcriptRef.current += ' ' + text;
    },
    onSpeechEnd: (transcript) => {
      if (transcript && aiWS.isConnected && interviewId) {
        aiWS.send({
          type: 'transcript',
          text: transcript,
          interview_id: interviewId,
        });
        setMessages(prev => [...prev, {
          role: 'user',
          content: `🎤 ${transcript}`,
          timestamp: Date.now(),
        }]);
      }
    },
  });

  // ─── Start Interview ──────────────────────────────────
  const startInterview = useCallback(async () => {
    if (!problem) return;
    try {
      const result = await api.startInterview({
        problem: problem.description,
        problem_title: problem.title,
        language,
      });
      setInterviewId(result.id);
      setStatus('active');

      // Connect all WebSockets
      codeWS.connect();
      aiWS.connect();

      // Auto-start voice
      setTimeout(() => {
        voice.startRecording().catch(() => {});
      }, 500);

      // Start AI session
      setTimeout(() => {
        aiWS.send({
          type: 'start_session',
          interview_id: result.id,
          problem_title: problem.title,
          problem: problem.description,
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start interview:', err);
    }
  }, [problem, language, codeWS, aiWS]);

  // ─── End Interview ────────────────────────────────────
  const endInterview = useCallback(async () => {
    if (!interviewId) return;
    setStatus('ending');
    voice.stopRecording();
    try {
      const result = await api.endInterview(interviewId, {
        code_snapshot: code,
        transcript: transcriptRef.current,
      });
      setScorecard(result.scorecard);
      setStatus('completed');
      setShowScorecard(true);
      codeWS.disconnect();
      aiWS.disconnect();
    } catch (err) {
      console.error('Failed to end interview:', err);
      setStatus('active');
    }
  }, [interviewId, code, voice, codeWS, aiWS]);

  // ─── Code Change → Real-time stream ────────────────────
  const handleCodeChange = useCallback((value: string) => {
    setCode(value);
    if (codeWS.isConnected) {
      codeWS.send({ type: 'code_update', code: value, language, interview_id: interviewId });
    }
    if (aiWS.isConnected && interviewId) {
      aiWS.send({ type: 'code_update', code: value, language, interview_id: interviewId });
    }
  }, [codeWS, aiWS, language, interviewId]);

  // ─── Run Code ─────────────────────────────────────────
  const runCode = useCallback(() => {
    setIsRunning(true);
    api.executeCode({ code, language })
      .then(result => { setOutput(result); setShowOutput(true); })
      .catch(console.error)
      .finally(() => setIsRunning(false));
  }, [code, language]);

  // ─── Run Tests ─────────────────────────────────────────
  const runTests = useCallback(async () => {
    if (!problem) return;
    setIsRunningTests(true);
    setTestResults(null);
    try {
      const result = await api.runTests(problem.id, code, language);
      setTestResults(result);
    } catch (err) {
      console.error('Test run failed:', err);
    } finally {
      setIsRunningTests(false);
    }
  }, [problem, code, language]);

  // ─── Send Chat Message ────────────────────────────────
  const sendMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    transcriptRef.current += ' ' + text;
    if (aiWS.isConnected && interviewId) {
      aiWS.send({ type: 'user_message', content: text, interview_id: interviewId });
    }
  }, [aiWS, interviewId]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage(chatInput.trim());
    setChatInput('');
  };

  // ─── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Problem Not Found</h2>
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 mt-4 inline-block">← Go Back</Link>
        </div>
      </div>
    );
  }

  // ─── Scorecard View ───────────────────────────────────
  if (showScorecard && scorecard) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] py-8 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/" className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Problems
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Interview Scorecard</h1>
          <p className="text-white/40 mb-8">{problem.title} · {language}</p>
          <Scorecard scorecard={scorecard} />
          <div className="mt-8 text-center">
            <Link href="/" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-colors">
              Practice Another Problem
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pattern labels ───────────────────────────────────
  const patternInfo: Record<string, { label: string; color: string }> = {
    nested_loops: { label: 'Nested Loops', color: 'bg-amber-500/20 text-amber-300' },
    recursion: { label: 'Recursion', color: 'bg-cyan-500/20 text-cyan-300' },
    brute_force: { label: 'Brute Force', color: 'bg-rose-500/20 text-rose-300' },
    sorting: { label: 'Sorting', color: 'bg-emerald-500/20 text-emerald-300' },
    hash_map: { label: 'Hash Map', color: 'bg-violet-500/20 text-violet-300' },
    modular_code: { label: 'Modular', color: 'bg-green-500/20 text-green-300' },
    no_error_handling: { label: 'No Error Handling', color: 'bg-orange-500/20 text-orange-300' },
  };

  // ═══════════════════════════════════════════════════════
  // ─── MAIN INTERVIEW LAYOUT ────────────────────────────
  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">

      {/* ═══ TOP BAR ═══ */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-white/[0.06] bg-[#10101a]/90 backdrop-blur-md shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/30 hover:text-white/60 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white/80">InterviewLens</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-sm text-white/50">{problem.title}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            problem.difficulty === 'Easy' ? 'bg-emerald-500/20 text-emerald-400' :
            problem.difficulty === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
            'bg-rose-500/20 text-rose-400'
          }`}>
            {problem.difficulty}
          </span>

          {/* Live analysis indicator */}
          {status === 'active' && (
            <div className="flex items-center gap-1.5 ml-2">
              <Activity className={`w-3 h-3 transition-colors duration-300 ${liveIndicator ? 'text-emerald-400' : 'text-white/20'}`} />
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Live</span>
            </div>
          )}
        </div>

        {/* Center - Timer */}
        <div className="flex items-center gap-2">
          {status === 'active' && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] px-3 py-1 rounded-lg">
              <Clock className="w-3 h-3 text-emerald-400" />
              <Timer isRunning={status === 'active'} />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Language */}
          <div className="relative">
            <select
              value={language}
              onChange={(e) => {
                const lang = e.target.value as 'python' | 'javascript';
                setLanguage(lang);
                if (problem?.starter_code?.[lang]) setCode(problem.starter_code[lang]);
              }}
              disabled={status === 'active'}
              className="appearance-none bg-white/[0.04] text-white/60 text-xs px-3 py-1.5 pr-7 rounded-lg border border-white/[0.06] outline-none cursor-pointer disabled:opacity-40"
            >
              <option value="python" className="bg-[#1a1a2e]">Python</option>
              <option value="javascript" className="bg-[#1a1a2e]">JavaScript</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
          </div>

          {/* Interview control */}
          {status === 'idle' ? (
            <button onClick={startInterview} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
              <Play className="w-3 h-3" /> Start Interview
            </button>
          ) : status === 'active' ? (
            <button onClick={endInterview} className="flex items-center gap-1.5 bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
              <Square className="w-3 h-3" /> End
            </button>
          ) : status === 'ending' ? (
            <div className="flex items-center gap-1.5 bg-white/[0.04] text-white/40 text-xs px-4 py-1.5 rounded-lg">
              <div className="w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" />
              Scoring...
            </div>
          ) : null}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT: EDITOR PANEL ─── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Problem statement bar */}
          {showProblem && (
            <div className="border-b border-white/[0.06] bg-[#0d0d15]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-medium text-white/50">Problem</span>
                </div>
                <button onClick={() => setShowProblem(false)} className="text-white/20 hover:text-white/50 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-3 max-h-32 overflow-y-auto custom-scrollbar">
                <h3 className="text-sm font-semibold text-white/80 mb-1.5">{problem.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed whitespace-pre-wrap">{problem.description}</p>
              </div>
            </div>
          )}

          {/* Show problem toggle when hidden */}
          {!showProblem && (
            <button
              onClick={() => setShowProblem(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-white/30 hover:text-white/50 border-b border-white/[0.06] bg-[#0d0d15] transition-colors"
            >
              <EyeOff className="w-3 h-3" /> Show Problem
            </button>
          )}

          {/* Monaco Editor */}
          <div className="flex-1 relative">
            {mounted ? (
              <MonacoEditor
                height="100%"
                language={language === 'javascript' ? 'javascript' : 'python'}
                value={code}
                onChange={(v) => handleCodeChange(v || '')}
                onMount={(editor) => {
                  editorRef.current = editor;
                  editor.addAction({
                    id: 'run-code',
                    label: 'Run Code',
                    keybindings: [2048 | 3],
                    run: () => runCode(),
                  });
                  editor.focus();
                }}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontLigatures: true,
                  lineHeight: 22,
                  padding: { top: 12, bottom: 12 },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  tabSize: 4,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  smoothScrolling: true,
                  bracketPairColorization: { enabled: true },
                  renderLineHighlight: 'all',
                  glyphMargin: false,
                  folding: true,
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-[#1e1e2e]">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Run button overlay */}
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {/* Pattern badges */}
              {patterns.length > 0 && (
                <div className="flex items-center gap-1">
                  {patterns.slice(0, 3).map(p => {
                    const info = patternInfo[p] || { label: p, color: 'bg-white/10 text-white/50' };
                    return (
                      <span key={p} className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${info.color}`}>
                        {info.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <button
                onClick={runTests}
                disabled={isRunningTests}
                className="flex items-center gap-1.5 bg-indigo-600/90 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all backdrop-blur-sm"
              >
                {isRunningTests ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
                {isRunningTests ? 'Testing...' : 'Tests'}
              </button>
              <button
                onClick={runCode}
                disabled={isRunning}
                className="flex items-center gap-1.5 bg-emerald-600/90 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all backdrop-blur-sm"
              >
                {isRunning ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                {isRunning ? 'Running...' : 'Run ⌘↵'}
              </button>
            </div>
          </div>

          {/* Output panel */}
          {showOutput && output && (
            <div className="border-t border-white/[0.06] bg-[#0d0d15]">
              <div className="flex items-center justify-between px-4 py-1.5">
                <div className="flex items-center gap-2">
                  <TerminalIcon className="w-3.5 h-3.5 text-white/30" />
                  <span className="text-xs font-medium text-white/40">Output</span>
                  {output.exit_code === 0 ? (
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                  )}
                  <span className="text-[10px] text-white/20">{output.execution_time}s</span>
                </div>
                <button onClick={() => setShowOutput(false)} className="text-white/20 hover:text-white/40">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="px-4 pb-3 max-h-32 overflow-y-auto font-mono text-xs">
                {output.stdout && <pre className="text-emerald-300/80 whitespace-pre-wrap">{output.stdout}</pre>}
                {output.stderr && <pre className="text-rose-400/80 whitespace-pre-wrap">{output.stderr}</pre>}
                {output.timed_out && <p className="text-amber-400">⏱ Execution timed out</p>}
                {!output.stdout && !output.stderr && !output.timed_out && (
                  <p className="text-white/20 italic">No output</p>
                )}
              </div>
            </div>
            )}
          
          {/* Test Results panel */}
          {testResults && (
            <div className="border-t border-white/[0.06] bg-[#0d0d15]">
              <TestResults
                results={testResults.results || []}
                totalTests={testResults.total_tests || 0}
                passed={testResults.passed || 0}
                failed={testResults.failed || 0}
                isRunning={isRunningTests}
              />
            </div>
          )}
        </div>

        {/* ─── RIGHT: AI CHAT + VOICE ─── */}
        <div className="w-[380px] flex flex-col border-l border-white/[0.06] bg-[#0c0c14]">

          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white/80">AI Interviewer</p>
                <p className="text-[10px] text-white/30">
                  {status === 'active' ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      Watching your code...
                    </span>
                  ) : 'Start interview to begin'}
                </p>
              </div>
            </div>
            {isAITyping && (
              <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Thinking
              </span>
            )}
          </div>

          {/* Voice indicator bar */}
          {status === 'active' && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Radio className={`w-3 h-3 ${voice.isRecording ? 'text-emerald-400' : 'text-white/20'}`} />
                <span className="text-[10px] text-white/40">
                  {voice.isRecording ? (voice.isSpeaking ? '🎙️ Listening...' : 'Mic active') : 'Mic off'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Live waveform */}
                {voice.isRecording && (
                  <div className="flex items-center gap-px h-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-[2px] rounded-full transition-all duration-100 ${voice.isSpeaking ? 'bg-emerald-400' : 'bg-white/10'}`}
                        style={{
                          height: voice.isSpeaking ? `${Math.random() * 14 + 4}px` : '3px',
                        }}
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={voice.isRecording ? voice.stopRecording : voice.startRecording}
                  className={`p-1 rounded transition-colors ${
                    voice.isRecording
                      ? 'text-rose-400 hover:bg-rose-500/10'
                      : 'text-white/30 hover:bg-white/5'
                  }`}
                >
                  {voice.isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {status === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                  <Brain className="w-8 h-8 text-indigo-400/60" />
                </div>
                <p className="text-sm text-white/40 mb-1">Ready to begin</p>
                <p className="text-xs text-white/20 max-w-[240px]">
                  Click "Start Interview" to begin. The AI will watch your code in real-time and ask follow-up questions.
                </p>
              </div>
            )}

            {messages.filter(m => m.role !== 'system').map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className={`max-w-[280px] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/30 text-indigo-100 rounded-br-sm'
                    : 'bg-white/[0.04] text-white/70 rounded-bl-sm border border-white/[0.06]'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isAITyping && (
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] px-3 py-2 rounded-xl rounded-bl-sm">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                </div>
              </div>
            )}

            {/* Voice transcript snippet */}
            {voice.transcript && status === 'active' && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-emerald-400/60 font-medium mb-0.5">Latest transcript</p>
                <p className="text-xs text-white/40 line-clamp-2">{voice.transcript.slice(-120)}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleChatSubmit} className="px-3 pb-3 pt-2 border-t border-white/[0.06]">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={status === 'active' ? "Type or speak your answer..." : "Start interview first..."}
                disabled={status !== 'active' || isAITyping}
                className="flex-1 bg-white/[0.04] border border-white/[0.06] text-white/80 text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/20 focus:border-indigo-500/30 disabled:opacity-40 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || status !== 'active' || isAITyping}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 text-white p-2 rounded-lg transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            {voice.error && (
              <p className="text-[10px] text-rose-400/60 mt-1.5 px-1">{voice.error}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
