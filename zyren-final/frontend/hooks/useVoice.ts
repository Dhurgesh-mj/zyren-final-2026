'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

type UseVoiceOptions = {
  onTranscript?: (text: string) => void;
  onSpeechEnd?: (transcript: string) => void;
  onVadStatus?: (status: any) => void;
  onTTSAudio?: (audioBase64: string, text: string) => void;
  wsUrl?: string;
  interviewId?: string;
};

export function useVoice(options: UseVoiceOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Set up audio processing
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect WebSocket for voice streaming
      const wsUrl = optionsRef.current.wsUrl || 'ws://localhost:8000/ws/voice-stream';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ 
          type: 'start_recording',
          interview_id: optionsRef.current.interviewId 
        }));
        setIsRecording(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'vad_status') {
            setIsSpeaking(msg.data.is_speech);
            optionsRef.current.onVadStatus?.(msg.data);
          }
          
          if (msg.type === 'transcript') {
            setTranscript(prev => prev + ' ' + msg.text);
            optionsRef.current.onTranscript?.(msg.text);
          }
          
          if (msg.type === 'speech_ended') {
            optionsRef.current.onSpeechEnd?.(msg.transcript);
          }

          // Handle TTS audio from AI
          if (msg.type === 'tts_audio' && msg.audio) {
            optionsRef.current.onTTSAudio?.(msg.audio, msg.text);
            
            // Auto-play TTS audio
            try {
              const byteCharacters = atob(msg.audio);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'audio/wav' });
              const audio = new Audio(URL.createObjectURL(blob));
              audio.play();
            } catch (e) {
              console.error('TTS playback error:', e);
            }
          }
          
          if (msg.type === 'tts_started') {
            setIsSpeaking(true);
          }
          
          if (msg.type === 'tts_ended') {
            setIsSpeaking(false);
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setError('Voice connection failed. Make sure the backend is running.');
      };

      // Process audio chunks and send to server
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert float32 to int16
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32768)));
        }
        
        // Convert to base64
        const uint8 = new Uint8Array(int16Data.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        
        ws.send(JSON.stringify({
          type: 'audio_chunk',
          audio_data: base64,
          interview_id: optionsRef.current.interviewId,
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (err: any) {
      setError(err.message || 'Failed to access microphone');
      console.error('Voice recording error:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stop_recording' }));
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRecording(false);
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isSpeaking,
    transcript,
    error,
    startRecording,
    stopRecording,
    clearTranscript: () => setTranscript(''),
  };
}
