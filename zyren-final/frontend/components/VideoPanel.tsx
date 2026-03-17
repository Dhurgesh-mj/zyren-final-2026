'use client';

import { useEffect, useRef } from 'react';
import { Video, VideoOff, Pause, Play } from 'lucide-react';

type VideoPanelProps = {
  isRecording: boolean;
  hasPermission: boolean;
  error: string | null;
  duration: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRequestPermission: () => void;
};

export default function VideoPanel({
  isRecording,
  hasPermission,
  error,
  duration,
  onStartRecording,
  onStopRecording,
  onRequestPermission,
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startPreview = async () => {
      if (!isRecording) return;
      
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 180 },
            facingMode: 'user',
          },
          audio: false,
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Video preview error:', err);
      }
    };

    startPreview();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRecording]);

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Video className={`w-4 h-4 ${isRecording ? 'text-red-400' : 'text-white/40'}`} />
          <span className="text-sm font-medium text-white/70">Video Recording</span>
        </div>
        
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-white/50 font-mono">{duration}</span>
          </div>
        )}
      </div>

      {/* Video Preview */}
      <div className="relative rounded-lg overflow-hidden bg-black/50 mb-3 aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        
        {!hasPermission && !isRecording && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <VideoOff className="w-8 h-8 text-white/40 mx-auto mb-2" />
              <p className="text-xs text-white/50">Camera not enabled</p>
            </div>
          </div>
        )}
        
        {isRecording && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/80 text-white text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              REC
            </span>
          </div>
        )}
      </div>

      {/* Control Button */}
      {!hasPermission ? (
        <button
          onClick={onRequestPermission}
          className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 glass text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          <Video className="w-4 h-4" /> Enable Camera
        </button>
      ) : isRecording ? (
        <button
          onClick={onStopRecording}
          className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
        >
          <VideoOff className="w-4 h-4" /> Stop Recording
        </button>
      ) : (
        <button
          onClick={onStartRecording}
          className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 glass text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          <Video className="w-4 h-4" /> Start Recording
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <p className="mt-2 text-xs text-white/30 text-center">
        Recording will be saved with your interview
      </p>
    </div>
  );
}
