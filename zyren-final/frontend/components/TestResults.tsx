'use client';

import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type TestResult = {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
};

type TestResultsProps = {
  results: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
  isRunning?: boolean;
};

export default function TestResults({ results, totalTests, passed, failed, isRunning }: TestResultsProps) {
  if (totalTests === 0) {
    return null;
  }

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">Test Results</h4>
        <div className="flex items-center gap-3 text-xs">
          {isRunning ? (
            <div className="flex items-center gap-1 text-brand-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running...
            </div>
          ) : (
            <>
              <span className="text-emerald-400">{passed} passed</span>
              {failed > 0 && <span className="text-red-400">{failed} failed</span>}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {results.map((result, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border ${
              result.passed
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : result.error
                ? 'bg-amber-500/10 border-amber-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {result.passed ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className={`w-4 h-4 ${result.error ? 'text-amber-400' : 'text-red-400'}`} />
              )}
              <span className="text-sm font-medium text-white">{result.name}</span>
            </div>
            
            {!result.passed && (
              <div className="mt-2 pl-6 text-xs space-y-1">
                {result.expected && (
                  <p className="text-white/50">
                    Expected: <span className="text-white/70 font-mono">{result.expected}</span>
                  </p>
                )}
                {result.actual && (
                  <p className="text-white/50">
                    Got: <span className="text-white/70 font-mono">{result.actual}</span>
                  </p>
                )}
                {result.error && (
                  <p className="text-amber-400">{result.error}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {totalTests > 0 && !isRunning && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                failed > 0 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${(passed / totalTests) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
