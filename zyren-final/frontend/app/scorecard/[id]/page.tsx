'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Brain, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import ScorecardComponent from '@/components/Scorecard';

export default function ScorecardPage() {
  const params = useParams();
  const interviewId = params.id as string;
  const [scorecard, setScorecard] = useState<any>(null);
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interviewId) return;

    Promise.all([
      api.getScorecard(interviewId),
      api.getInterview(interviewId),
    ])
      .then(([sc, iv]) => {
        setScorecard(sc);
        setInterview(iv);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [interviewId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !scorecard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            {error || 'Scorecard not found'}
          </h2>
          <Link href="/" className="btn-primary mt-4 inline-block">Go Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/history" className="btn-secondary px-4 py-2 text-sm flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Interview Scorecard</h1>
          </div>
        </div>

        {interview && (
          <div className="glass-card mb-8">
            <h2 className="text-xl font-semibold text-white mb-2">{interview.problem_title}</h2>
            <div className="flex items-center gap-4 text-sm text-white/40">
              <span>Language: {interview.language}</span>
              <span>•</span>
              <span>Status: {interview.status}</span>
              {interview.started_at && (
                <>
                  <span>•</span>
                  <span>{new Date(interview.started_at).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        )}

        <ScorecardComponent scorecard={scorecard} />

        {interview?.code_snapshot && (
          <div className="glass-card mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Final Code</h3>
            <pre className="text-sm text-white/70 font-mono bg-surface-950 rounded-xl p-4 overflow-x-auto">
              {interview.code_snapshot}
            </pre>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href="/" className="btn-primary px-8 py-3 inline-flex items-center gap-2">
            Practice Another Problem
          </Link>
        </div>
      </div>
    </div>
  );
}
