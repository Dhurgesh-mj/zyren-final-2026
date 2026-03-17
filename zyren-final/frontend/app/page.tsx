'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api, Problem } from '@/lib/api';
import {
  Brain, Code2, Mic, BarChart3, Play, ChevronRight,
  Zap, Shield, MessageSquare, Sparkles,
} from 'lucide-react';

export default function HomePage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProblems()
      .then(setProblems)
      .catch(() => setProblems([]))
      .finally(() => setLoading(false));
  }, []);

  const difficultyColor: Record<string, string> = {
    Easy: 'badge-success',
    Medium: 'badge-warning',
    Hard: 'badge-danger',
  };

  return (
    <div className="min-h-screen">
      {/* ─── Hero Section ─── */}
      <header className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">InterviewLens</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/history" className="btn-secondary text-sm px-4 py-2">
                History
              </Link>
            </div>
          </nav>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 badge-brand mb-6 text-sm">
              <Sparkles className="w-4 h-4" />
              AI-Powered Interview Practice
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 leading-tight">
              Master Your
              <br />
              <span className="gradient-text">Technical Interview</span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed">
              Practice with an AI interviewer that watches you code, listens to your explanations,
              asks dynamic follow-up questions, and generates a detailed scorecard.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a href="#problems" className="btn-primary text-lg px-8 py-4 flex items-center gap-2">
                <Play className="w-5 h-5" /> Start Interview
              </a>
              <Link href="/history" className="btn-secondary text-lg px-8 py-4">
                View Past Sessions
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-0 w-72 h-72 bg-brand-500/10 rounded-full blur-[100px] -translate-y-1/2" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />
      </header>

      {/* ─── Features Grid ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <Code2 className="w-6 h-6" />,
              title: 'Live Coding',
              desc: 'Monaco Editor with syntax highlighting, code execution, and real-time streaming.',
              color: 'from-cyan-500 to-blue-500',
            },
            {
              icon: <Brain className="w-6 h-6" />,
              title: 'AI Interviewer',
              desc: 'Llama 3.2 powered interviewer asks contextual follow-up questions.',
              color: 'from-brand-500 to-purple-500',
            },
            {
              icon: <Mic className="w-6 h-6" />,
              title: 'Voice Interaction',
              desc: 'Speak naturally — Whisper STT captures your explanation in real-time.',
              color: 'from-emerald-500 to-teal-500',
            },
            {
              icon: <BarChart3 className="w-6 h-6" />,
              title: 'Scorecard',
              desc: 'Get scored on technical skill, problem solving, and communication.',
              color: 'from-amber-500 to-orange-500',
            },
          ].map((f, i) => (
            <div key={i} className="glass-card group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 
                              group-hover:scale-110 transition-transform duration-300`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Problems Section ─── */}
      <section id="problems" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Choose a <span className="gradient-text">Problem</span>
          </h2>
          <p className="text-white/50 text-lg">
            Select a coding challenge to start your interview session
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/interview?problem=${problem.id}`}
                className="glass-card group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={difficultyColor[problem.difficulty] || 'badge-brand'}>
                    {problem.difficulty}
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-brand-400 
                                           group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-brand-300 transition-colors">
                  {problem.title}
                </h3>
                <p className="text-white/40 text-sm line-clamp-3 leading-relaxed">
                  {problem.description}
                </p>
                <div className="mt-4 flex items-center gap-2 text-brand-400 text-sm font-medium opacity-0 
                                group-hover:opacity-100 transition-opacity duration-300">
                  <Play className="w-4 h-4" /> Start Interview
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── How It Works ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            How It <span className="gradient-text-accent">Works</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              icon: <Zap className="w-6 h-6" />,
              title: 'Start Coding',
              desc: 'Pick a problem and start writing your solution in the Monaco editor.',
            },
            {
              step: '02',
              icon: <MessageSquare className="w-6 h-6" />,
              title: 'AI Interviews You',
              desc: 'The AI analyzes your code in real-time and asks smart follow-up questions.',
            },
            {
              step: '03',
              icon: <Shield className="w-6 h-6" />,
              title: 'Get Your Scorecard',
              desc: 'Receive a detailed evaluation across technical, problem-solving, and communication.',
            },
          ].map((s, i) => (
            <div key={i} className="relative glass-card text-center">
              <div className="text-6xl font-black text-brand-500/10 absolute top-4 left-6">
                {s.step}
              </div>
              <div className="relative z-10 pt-8">
                <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mx-auto mb-5">
                  {s.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{s.title}</h3>
                <p className="text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-white/40">InterviewLens © 2026</span>
          </div>
          <div className="text-sm text-white/30">
            Powered by Llama 3.2 + Whisper
          </div>
        </div>
      </footer>
    </div>
  );
}
