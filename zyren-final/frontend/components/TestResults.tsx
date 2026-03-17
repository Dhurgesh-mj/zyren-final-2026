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
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white/80">Test Results</h4>
        <div className="flex items-center gap-2 text-xs">
          {isRunning ? (
            <div className="flex items-center gap-1 text-indigo-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running...
            </div>
          ) : (
            <>
              <span className="text-emerald-400 font-medium">{passed} passed</span>
              {failed > 0 && <span className="text-red-400 font-medium">{failed} failed</span>}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-28 overflow-y-auto">
        {results.map((result, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
              result.passed
                ? 'bg-emerald-500/5 border-emerald-500/10'
                : result.error
                ? 'bg-amber-500/5 border-amber-500/10'
                : 'bg-red-500/5 border-red-500/10'
            }`}
          >
            {result.passed ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle className={`w-3.5 h-3.5 flex-shrink-0 ${result.error ? 'text-amber-400' : 'text-red-400'}`} />
            )}
            <span className="text-xs font-medium text-white/80 truncate flex-1">{result.name}</span>
            
            {!result.passed && result.expected && (
              <span className="text-[10px] text-white/40 font-mono truncate max-w-[80px]">
                {result.expected}
              </span>
            )}
          </div>
        ))}
      </div>

      {totalTests > 0 && !isRunning && (
        <div className="mt-3">
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
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
