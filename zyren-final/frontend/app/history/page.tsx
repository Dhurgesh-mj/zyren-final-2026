'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Brain, Clock, ChevronRight, Trophy } from 'lucide-react';
import { api } from '@/lib/api';

type InterviewSummary = {
  id: string;
  problem_title: string;
  language: string;
  status: string;
  overall_score: number | null;
  started_at: string | null;
  ended_at: string | null;
};

export default function HistoryPage() {
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getInterviews()
      .then(setInterviews)
      .catch(() => setInterviews([]))
      .finally(() => setLoading(false));
  }, []);

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-white/30';
    if (score >= 8) return 'text-emerald-400';
    if (score >= 6) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen py-8 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Interview History</h1>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-white/10 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white/40 mb-2">No interviews yet</h2>
            <p className="text-white/30 mb-6">Start your first interview to see your history here.</p>
            <Link href="/" className="btn-primary inline-block">Start Interview</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {interviews.map((interview) => (
              <Link
                key={interview.id}
                href={interview.status === 'completed' ? `/scorecard/${interview.id}` : '#'}
                className="glass-card flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center">
                    <span className={`text-lg font-bold ${getScoreColor(interview.overall_score)}`}>
                      {interview.overall_score ?? '—'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-brand-300 transition-colors">
                      {interview.problem_title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                      <span className="capitalize">{interview.language}</span>
                      <span>•</span>
                      <span className={interview.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>
                        {interview.status}
                      </span>
                      {interview.started_at && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(interview.started_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
