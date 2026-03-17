'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

type TimerProps = {
  isRunning: boolean;
  onTimeUpdate?: (seconds: number) => void;
};

export default function Timer({ isRunning, onTimeUpdate }: TimerProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setSeconds((s) => {
        const newVal = s + 1;
        onTimeUpdate?.(newVal);
        return newVal;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, onTimeUpdate]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 glass px-4 py-2 rounded-xl">
      <Clock className={`w-4 h-4 ${isRunning ? 'text-emerald-400' : 'text-white/40'}`} />
      <span className="text-sm font-mono font-medium text-white/80">
        {formatTime(seconds)}
      </span>
      {isRunning && (
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      )}
    </div>
  );
}
