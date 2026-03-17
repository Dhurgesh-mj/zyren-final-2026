'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Brain, Play, Square, Terminal as TerminalIcon,
  X, AlertTriangle, CheckCircle, ArrowLeft,
  Mic, MicOff, Radio, Send, Bot, User,
  Sparkles, Clock, ChevronDown, Code2,
  Eye, EyeOff, Zap, Activity, Volume2, VolumeX
} from 'lucide-react';
import { api, type Problem, type ASTAnalysis, type ExecutionResult } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useVoice } from '@/hooks/useVoice';
import { useAIVoice } from '@/hooks/useAIVoice';
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
  const [language, setLanguage] = useState<string>('python');
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

  // ─── AI Voice (Text-to-Speech for AI responses) ────────
  const aiVoice = useAIVoice({ enabled: true, rate: 1.05, pitch: 1.0 });

  // ─── WebSocket: AI Interviewer ─────────────────────────
  const aiWS = useWebSocket(
    `${api.wsUrl}/ws/ai-interviewer`,
    {
      onMessage: (msg) => {
        if (msg.type === 'ai_message' || msg.type === 'follow_up') {
          const content = msg.content;
          setMessages(prev => [...prev, {
            role: 'assistant',
            content,
            timestamp: Date.now(),
          }]);
          setIsAITyping(false);
          // Speak the AI response aloud
          aiVoice.speak(content);
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
    aiVoice.stop();
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
      setShowOutput(false); // Switch to tests tab
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
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] bg-[#10101a]/90 backdrop-blur-md shrink-0">
        {/* Left */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white/90">InterviewLens</span>
              <span className="text-white/20 mx-2">/</span>
              <span className="text-sm text-white/60">{problem.title}</span>
            </div>
          </div>
          
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

        {/* Center - Timer & Language */}
        <div className="flex items-center gap-4">
          {/* Language selector */}
          <div className="relative group">
            <button
              disabled={status === 'active'}
              className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 text-white/80 text-sm px-4 py-2 rounded-lg border border-white/[0.08] transition-all"
            >
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span className="capitalize">{language}</span>
              <ChevronDown className="w-3 h-3 text-white/40" />
            </button>
            
            {/* Language dropdown */}
            <div className="absolute top-full right-0 mt-1 w-48 bg-[#1a1a2e] border border-white/[0.1] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              {[
                { id: 'python', label: 'Python', color: 'bg-blue-500' },
                { id: 'javascript', label: 'JavaScript', color: 'bg-yellow-500' },
                { id: 'java', label: 'Java', color: 'bg-orange-500' },
                { id: 'cpp', label: 'C++', color: 'bg-purple-500' },
                { id: 'c', label: 'C', color: 'bg-gray-500' },
                { id: 'go', label: 'Go', color: 'bg-cyan-500' },
                { id: 'rust', label: 'Rust', color: 'bg-amber-600' },
                { id: 'typescript', label: 'TypeScript', color: 'bg-blue-600' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => {
                    setLanguage(lang.id);
                    if (problem?.starter_code?.[lang.id]) {
                      setCode(problem.starter_code[lang.id]);
                    } else {
                      // Default starter code for languages not in problem
                      const defaults: Record<string, string> = {
                        python: '# Write your solution here\n',
                        javascript: '// Write your solution here\n',
                        java: 'class Solution {\n    // Write your solution here\n}\n',
                        cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
                        c: '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
                        go: 'package main\n\nfunc main() {\n    // Write your solution here\n}\n',
                        rust: 'fn main() {\n    // Write your solution here\n}\n',
                        typescript: '// Write your solution here\n',
                      };
                      setCode(defaults[lang.id] || '// Write your solution here\n');
                    }
                  }}
                  disabled={status === 'active'}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed first:rounded-t-lg last:rounded-b-lg"
                >
                  <span className={`w-2 h-2 rounded-full ${lang.color}`} />
                  {lang.label}
                  {language === lang.id && <span className="ml-auto text-indigo-400">✓</span>}
                </button>
              ))}
            </div>
          </div>
          
          {status === 'active' && (
            <div className="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <Timer isRunning={status === 'active'} />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Interview control */}
          {status === 'idle' ? (
            <button 
              onClick={startInterview} 
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
            >
              <Play className="w-4 h-4" /> Start Interview
            </button>
          ) : status === 'active' ? (
            <button 
              onClick={endInterview} 
              className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-all shadow-lg shadow-rose-500/20"
            >
              <Square className="w-4 h-4" /> End Interview
            </button>
          ) : status === 'ending' ? (
            <div className="flex items-center gap-2 bg-white/[0.04] text-white/40 text-sm px-4 py-2 rounded-lg">
              <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              Generating Scorecard...
            </div>
          ) : null}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── LEFT: EDITOR PANEL ─── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Problem statement - collapsible sidebar style */}
          <div className="border-b border-white/[0.06] bg-[#0d0d15]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#12121a]">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-white/70">Problem Description</span>
              </div>
              <button 
                onClick={() => setShowProblem(!showProblem)} 
                className="text-white/30 hover:text-white/60 transition-colors text-xs flex items-center gap-1"
              >
                {showProblem ? 'Hide' : 'Show'}
                <ChevronDown className={`w-3 h-3 transition-transform ${showProblem ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {showProblem && (
              <div className="px-4 py-3 max-h-36 overflow-y-auto custom-scrollbar">
                <h3 className="text-sm font-semibold text-white/90 mb-2">{problem.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed whitespace-pre-wrap">{problem.description}</p>
              </div>
            )}
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 relative bg-[#1e1e2e] min-h-0 overflow-hidden">
            {/* Editor Header */}
            <div className="h-10 flex items-center justify-between px-4 bg-[#252536] border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-xs text-white/40 font-mono">
                  {language === 'python' ? 'solution.py' : 
                   language === 'javascript' ? 'solution.js' :
                   language === 'java' ? 'Solution.java' :
                   language === 'cpp' ? 'solution.cpp' :
                   language === 'c' ? 'solution.c' :
                   language === 'go' ? 'solution.go' :
                   language === 'rust' ? 'solution.rs' :
                   language === 'typescript' ? 'solution.ts' : 'solution.txt'}
                </span>
              </div>
              
              {/* Quick actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={runCode}
                  disabled={isRunning || isRunningTests}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs rounded-md transition-all"
                >
                  <Play className="w-3 h-3" />
                  Run
                </button>
                <button
                  onClick={runTests}
                  disabled={isRunningTests || isRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs rounded-md transition-all"
                >
                  <CheckCircle className="w-3 h-3" />
                  Test
                </button>
              </div>
            </div>
            
            {/* Monaco Editor */}
            {mounted ? (
              <div className="h-[calc(100%-40px)]">
                <MonacoEditor
                  height="100%"
                  language={language}
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
                    lineHeight: 24,
                    padding: { top: 16, bottom: 16 },
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
                    lineNumbers: 'on',
                    renderWhitespace: 'selection',
                    guides: {
                      indentation: true,
                      bracketPairs: true,
                    },
                  }}
                />
              </div>
            ) : (
              <div className="h-[calc(100%-40px)] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Output & Tests Panel - Tabs */}
          {(showOutput || testResults) && (
            <div className="border-t border-white/[0.06] bg-[#0d0d15]">
              {/* Tabs */}
              <div className="flex items-center justify-between px-4 border-b border-white/[0.04]">
                <div className="flex items-center gap-1">
                  {output && (
                    <button
                      onClick={() => setShowOutput(true)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                        showOutput
                          ? 'text-white border-emerald-500'
                          : 'text-white/40 border-transparent hover:text-white/60'
                      }`}
                    >
                      <TerminalIcon className="w-3.5 h-3.5" />
                      Output
                      {output.exit_code === 0 ? (
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                      )}
                    </button>
                  )}
                  {testResults && (
                    <button
                      onClick={() => setShowOutput(false)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                        !showOutput
                          ? 'text-white border-indigo-500'
                          : 'text-white/40 border-transparent hover:text-white/60'
                      }`}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Test Results
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        testResults.failed > 0 
                          ? 'bg-rose-500/20 text-rose-400' 
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {testResults.passed}/{testResults.total_tests}
                      </span>
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => { setShowOutput(false); setTestResults(null); }} 
                  className="text-white/20 hover:text-white/40 p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              
              {/* Content */}
              <div className="h-60 overflow-y-auto">
                {showOutput && output && (
                  <div className="px-4 py-3 font-mono text-xs">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-white/30">{output.execution_time}s</span>
                      {output.timed_out && <span className="text-amber-400 text-[10px]">⏱ Timed out</span>}
                    </div>
                    {output.stdout && <pre className="text-emerald-300/80 whitespace-pre-wrap">{output.stdout}</pre>}
                    {output.stderr && <pre className="text-rose-400/80 whitespace-pre-wrap">{output.stderr}</pre>}
                    {!output.stdout && !output.stderr && !output.timed_out && (
                      <p className="text-white/20 italic">No output</p>
                    )}
                  </div>
                )}
                
                {!showOutput && testResults && (
                  <TestResults
                    results={testResults.results || []}
                    totalTests={testResults.total_tests || 0}
                    passed={testResults.passed || 0}
                    failed={testResults.failed || 0}
                    isRunning={isRunningTests}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: AI CHAT + VOICE ─── */}
        <div className="w-[400px] flex flex-col border-l border-white/[0.06] bg-[#0c0c14]">

          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#10101a]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">AI Interviewer</p>
                <p className="text-xs text-white/40">
                  {status === 'active' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span className="text-emerald-400">Live</span> · Watching your code
                    </span>
                  ) : (
                    <span className="text-white/30">Start interview to begin</span>
                  )}
                </p>
              </div>
            </div>
            
            {/* Voice controls */}
            <div className="flex items-center gap-2">
              {/* AI Voice toggle */}
              <button
                onClick={aiVoice.toggle}
                title={aiVoice.enabled ? 'Mute AI voice (TTS)' : 'Enable AI voice (TTS)'}
                className={`p-2 rounded-lg transition-colors ${
                  aiVoice.enabled
                    ? 'text-purple-400 bg-purple-500/10'
                    : 'text-white/30 hover:bg-white/5'
                }`}
              >
                {aiVoice.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          {/* AI Status bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0d0d15] border-b border-white/[0.04]">
            <div className="flex items-center gap-3">
              {isAITyping && (
                <span className="text-xs text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI is thinking...
                </span>
              )}
              {aiVoice.isSpeaking && !isAITyping && (
                <span className="text-xs text-purple-400 flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 animate-pulse" /> AI is speaking...
                </span>
              )}
              {!isAITyping && !aiVoice.isSpeaking && status === 'active' && (
                <span className="text-xs text-white/30">Waiting for your response...</span>
              )}
            </div>
          </div>

          {/* Voice control bar */}
          {status === 'active' && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-[#0d0d15]">
              <div className="flex items-center gap-3">
                <button
                  onClick={voice.isRecording ? voice.stopRecording : voice.startRecording}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    voice.isRecording
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08] border border-white/[0.06]'
                  }`}
                >
                  {voice.isRecording ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      <span>Stop Recording</span>
                      <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Start Voice</span>
                    </>
                  )}
                </button>
                
                {/* Waveform visualization */}
                {voice.isRecording && (
                  <div className="flex items-center gap-px h-6">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-[3px] rounded-full transition-all duration-150 ${
                          voice.isSpeaking ? 'bg-emerald-400' : 'bg-white/10'
                        }`}
                        style={{
                          height: voice.isSpeaking ? `${Math.random() * 20 + 6}px` : '4px',
                          animationDelay: `${i * 50}ms`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              <div className="text-xs text-white/40">
                {voice.isRecording ? (
                  voice.isSpeaking ? (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Listening...
                    </span>
                  ) : (
                    <span>Waiting for speech...</span>
                  )
                ) : (
                  <span>Click to speak</span>
                )}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {status === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/10">
                  <Brain className="w-10 h-10 text-indigo-400/60" />
                </div>
                <p className="text-base text-white/50 mb-2 font-medium">Ready to Begin</p>
                <p className="text-sm text-white/30 leading-relaxed">
                  Click "Start Interview" to begin. The AI will watch your code in real-time, ask follow-up questions, and provide feedback.
                </p>
              </div>
            )}

            {messages.filter(m => m.role !== 'system').map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[280px] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-md'
                    : 'bg-white/[0.06] text-white/80 rounded-bl-md border border-white/[0.08]'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            ))}

            {isAITyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white/[0.06] border border-white/[0.08] px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                </div>
              </div>
            )}

            {/* Voice transcript snippet */}
            {voice.transcript && status === 'active' && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Mic className="w-3 h-3 text-emerald-400" />
                  <p className="text-[11px] text-emerald-400 font-medium">Your voice input</p>
                </div>
                <p className="text-sm text-white/60 line-clamp-2">{voice.transcript.slice(-200)}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleChatSubmit} className="px-4 pb-4 pt-3 border-t border-white/[0.06] bg-[#0d0d15]">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={status === 'active' ? "Type your answer..." : "Start interview to chat..."}
                disabled={status !== 'active' || isAITyping}
                className="flex-1 bg-white/[0.06] border border-white/[0.08] text-white/80 text-sm rounded-xl px-4 py-3 outline-none placeholder:text-white/25 focus:border-indigo-500/30 focus:bg-white/[0.08] disabled:opacity-40 transition-all"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || status !== 'active' || isAITyping}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 text-white p-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:shadow-none"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            {voice.error && (
              <p className="text-xs text-rose-400/80 mt-2 px-1">{voice.error}</p>
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
