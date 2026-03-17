'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Brain, Code2, Mic, BarChart3, Play, ChevronRight,
  Zap, Shield, MessageSquare, Sparkles, Activity, ArrowRight, LogOut, User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Problem = {
  id: string;
  title: string;
  difficulty: string;
  description: string;
};

export default function HomePage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/problems')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setProblems(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load problems:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const diffColor: Record<string, string> = {
    Easy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    Hard: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">

      {/* ─── Animated BG ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/[0.04] rounded-full blur-[150px]" />
      </div>

      {/* ─── Nav ─── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold">InterviewLens</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/history" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            History
          </Link>
          <Link href="/profile" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Profile
          </Link>
          <AuthNav />
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium px-4 py-1.5 rounded-full mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Technical Interview Practice
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] mb-6">
          Master Your
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Technical Interview
          </span>
        </h1>

        <p className="text-lg text-white/40 max-w-xl mx-auto mb-10 leading-relaxed">
          Code in a real IDE. An AI interviewer watches your code live, asks dynamic follow-ups, 
          and scores you across technical skill, problem solving & communication.
        </p>

        <div className="flex items-center justify-center gap-4">
          <a href="#problems" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-7 py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5">
            <Play className="w-4 h-4" /> Start Practicing
          </a>
          <Link href="/history" className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 hover:text-white/80 font-medium px-7 py-3.5 rounded-xl transition-all">
            View History
          </Link>
        </div>
      </header>

      {/* ─── Features ─── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { icon: <Code2 className="w-5 h-5" />, title: 'Live IDE', desc: 'Monaco Editor with real-time code streaming', gradient: 'from-cyan-500 to-blue-600' },
            { icon: <Brain className="w-5 h-5" />, title: 'AI Interviewer', desc: 'Llama 3.2 asks contextual follow-ups', gradient: 'from-indigo-500 to-purple-600' },
            { icon: <Mic className="w-5 h-5" />, title: 'Voice Chat', desc: 'Speak your explanation naturally', gradient: 'from-emerald-500 to-teal-600' },
            { icon: <BarChart3 className="w-5 h-5" />, title: 'Scorecard', desc: 'Detailed scoring across 3 dimensions', gradient: 'from-amber-500 to-orange-600' },
          ].map((f, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">{f.title}</h3>
              <p className="text-xs text-white/35 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Problems ─── */}
      <section id="problems" className="relative z-10 max-w-6xl mx-auto px-6 pb-32">
        <div className="mb-10">
          <h2 className="text-3xl font-bold mb-2">
            Choose a <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Problem</span>
          </h2>
          <p className="text-white/35">Select a challenge to start your interview session</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex items-center gap-3 text-white/30">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading problems...</span>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-white/30 text-sm mb-2">Failed to load problems</p>
            <p className="text-white/20 text-xs mb-4">{error}</p>
            <p className="text-white/20 text-xs">Make sure the backend is running on port 8000</p>
          </div>
        ) : problems.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-white/30 text-sm">No problems available</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/interview?problem=${problem.id}`}
                className="group bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.04] hover:border-indigo-500/20 transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${diffColor[problem.difficulty] || 'bg-white/10 text-white/50 border-white/10'}`}>
                    {problem.difficulty}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="text-base font-semibold text-white/80 mb-2 group-hover:text-indigo-300 transition-colors">
                  {problem.title}
                </h3>
                <p className="text-xs text-white/30 line-clamp-2 leading-relaxed mb-3">
                  {problem.description}
                </p>
                <div className="flex items-center gap-1.5 text-indigo-400/60 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="w-3 h-3" /> Start Interview
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── How It Works ─── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-32">
        <h2 className="text-3xl font-bold text-center mb-12">
          How It <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Works</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: '01', icon: <Zap className="w-5 h-5 text-amber-400" />, title: 'Start Coding', desc: 'Pick a problem and write your solution in the Monaco editor.' },
            { step: '02', icon: <Activity className="w-5 h-5 text-indigo-400" />, title: 'AI Watches Live', desc: 'As you code, the AI analyzes patterns and asks real-time follow-up questions.' },
            { step: '03', icon: <Shield className="w-5 h-5 text-emerald-400" />, title: 'Get Scored', desc: 'Receive a detailed scorecard across technical skill, problem solving & communication.' },
          ].map((s, i) => (
            <div key={i} className="relative bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 text-center">
              <span className="absolute top-4 right-5 text-4xl font-black text-white/[0.03]">{s.step}</span>
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                {s.icon}
              </div>
              <h3 className="text-sm font-semibold text-white/80 mb-2">{s.title}</h3>
              <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400/40" />
            <span className="text-xs text-white/25">InterviewLens © 2026</span>
          </div>
          <span className="text-xs text-white/20">Powered by Llama 3.2 + Whisper</span>
        </div>
      </footer>
    </div>
  );
}

// Auth Navigation Component
function AuthNav() {
  const { user, isAuthenticated, logout, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />;
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <span>{user?.name}</span>
        </div>
        <button
          onClick={() => { logout(); router.push('/'); }}
          className="text-sm text-white/40 hover:text-white/70 transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="text-sm text-white/60 hover:text-white transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/register"
        className="text-sm bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
      >
        Sign Up
      </Link>
    </div>
  );
}
