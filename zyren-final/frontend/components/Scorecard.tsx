'use client';

import { Trophy, Target, MessageSquare, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

type ScorecardProps = {
  scorecard: {
    technical_score: number;
    problem_solving_score: number;
    communication_score: number;
    overall_score: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
    detailed_feedback: Record<string, string>;
  };
};

export default function Scorecard({ scorecard: rawScorecard }: ScorecardProps) {
  // Defensive defaults for all properties
  const scorecard = {
    technical_score: rawScorecard.technical_score ?? 5,
    problem_solving_score: rawScorecard.problem_solving_score ?? 5,
    communication_score: rawScorecard.communication_score ?? 5,
    overall_score: rawScorecard.overall_score ?? Math.round(
      ((rawScorecard.technical_score ?? 5) + (rawScorecard.problem_solving_score ?? 5) + (rawScorecard.communication_score ?? 5)) / 3
    ),
    feedback: rawScorecard.feedback ?? 'Interview completed.',
    strengths: Array.isArray(rawScorecard.strengths) ? rawScorecard.strengths : ['Completed the interview'],
    improvements: Array.isArray(rawScorecard.improvements) ? rawScorecard.improvements : ['Consider explaining your approach'],
    detailed_feedback: rawScorecard.detailed_feedback ?? {},
  };

  const scores = [
    {
      label: 'Technical Accuracy',
      score: scorecard.technical_score,
      icon: <Target className="w-5 h-5" />,
      color: 'from-cyan-500 to-blue-500',
      detail: scorecard.detailed_feedback?.technical,
    },
    {
      label: 'Problem Solving',
      score: scorecard.problem_solving_score,
      icon: <Trophy className="w-5 h-5" />,
      color: 'from-emerald-500 to-teal-500',
      detail: scorecard.detailed_feedback?.problem_solving,
    },
    {
      label: 'Communication',
      score: scorecard.communication_score,
      icon: <MessageSquare className="w-5 h-5" />,
      color: 'from-violet-500 to-purple-500',
      detail: scorecard.detailed_feedback?.communication,
    },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-emerald-400';
    if (score >= 6) return 'text-amber-400';
    if (score >= 4) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 9) return 'Excellent';
    if (score >= 7) return 'Good';
    if (score >= 5) return 'Average';
    if (score >= 3) return 'Below Average';
    return 'Needs Improvement';
  };

  return (
    <div className="space-y-8">
      {/* ─── Overall Score ─── */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-brand-500/30 mb-4 relative">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 128 128">
            <circle
              cx="64" cy="64" r="58"
              fill="none"
              stroke="rgba(99,102,241,0.1)"
              strokeWidth="6"
            />
            <circle
              cx="64" cy="64" r="58"
              fill="none"
              stroke="url(#scoreGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(scorecard.overall_score / 10) * 364} 364`}
              transform="rotate(-90 64 64)"
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
          </svg>
          <div className="text-center">
            <span className={`text-4xl font-black ${getScoreColor(scorecard.overall_score)}`}>
              {scorecard.overall_score}
            </span>
            <p className="text-xs text-white/40 font-medium">/10</p>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-white">
          {getScoreLabel(scorecard.overall_score)}
        </h3>
        <p className="text-white/50 mt-2 max-w-lg mx-auto">{scorecard.feedback}</p>
      </div>

      {/* ─── Individual Scores ─── */}
      <div className="grid md:grid-cols-3 gap-4">
        {scores.map((s, i) => (
          <div key={i} className="glass-card">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                {s.icon}
              </div>
              <div>
                <p className="text-xs text-white/40 font-medium">{s.label}</p>
                <p className={`text-2xl font-bold ${getScoreColor(s.score)}`}>{s.score}/10</p>
              </div>
            </div>
            {/* Score bar */}
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${s.color} transition-all duration-1000`}
                style={{ width: `${s.score * 10}%` }}
              />
            </div>
            {s.detail && (
              <p className="text-xs text-white/40 mt-3 leading-relaxed">{s.detail}</p>
            )}
          </div>
        ))}
      </div>

      {/* ─── Strengths & Improvements ─── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h4 className="font-semibold text-white">Strengths</h4>
          </div>
          <ul className="space-y-3">
            {scorecard.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-white/70">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Improvements */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-amber-400" />
            <h4 className="font-semibold text-white">Areas for Improvement</h4>
          </div>
          <ul className="space-y-3">
            {scorecard.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-white/70">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
