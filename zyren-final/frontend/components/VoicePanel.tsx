'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Radio, Volume2, VolumeX, Loader2 } from 'lucide-react';

type VoicePanelProps = {
  isRecording: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

export default function VoicePanel({
  isRecording,
  isSpeaking,
  transcript,
  error,
  onStartRecording,
  onStopRecording,
}: VoicePanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [ttsAudio, setTtsAudio] = useState<HTMLAudioElement | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Handle TTS audio playback
  const playAudio = useCallback((audioBase64: string) => {
    try {
      const byteCharacters = atob(audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.play();
      setIsPlaying(true);
      setTtsAudio(audio);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  // Stop audio if recording starts
  useEffect(() => {
    if (isRecording && ttsAudio) {
      ttsAudio.pause();
      setIsPlaying(false);
    }
  }, [isRecording, ttsAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ttsAudio) {
        ttsAudio.pause();
      }
    };
  }, [ttsAudio]);

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${isRecording ? 'text-red-400' : 'text-white/40'}`} />
          <span className="text-sm font-medium text-white/70">Voice Input</span>
        </div>
        
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-xs text-white/50">
              {isSpeaking ? 'Listening...' : 'Waiting for speech...'}
            </span>
          </div>
        )}
        
        {isSpeaking && !isRecording && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-brand-400 animate-spin" />
            <span className="text-xs text-brand-400">AI Speaking...</span>
          </div>
        )}
      </div>

      {/* Voice waveform visualization */}
      {isRecording && (
        <div className="flex items-center justify-center gap-1 h-10 mb-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-150 ${
                isSpeaking ? 'bg-brand-400' : 'bg-white/20'
              }`}
              style={{
                height: isSpeaking
                  ? `${Math.random() * 30 + 10}px`
                  : '4px',
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Record button */}
      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className={`w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
          isRecording
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 recording-pulse'
            : 'glass text-white/70 hover:text-white hover:bg-white/10'
        }`}
      >
        {isRecording ? (
          <>
            <MicOff className="w-4 h-4" /> Stop Recording
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" /> Start Voice
          </>
        )}
      </button>

      {/* Transcript preview */}
      {transcript && (
        <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/40 mb-1 font-medium">Transcript</p>
          <p className="text-sm text-white/70 line-clamp-3">{transcript}</p>
        </div>
      )}

      {/* Voice mode indicator */}
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/30">
        <Volume2 className="w-3 h-3" />
        <span>Voice-to-Voice Mode</span>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
