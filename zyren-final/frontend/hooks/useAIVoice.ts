'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type AIVoiceOptions = {
  enabled?: boolean;
  rate?: number;     // 0.5 - 2.0
  pitch?: number;    // 0 - 2.0
  volume?: number;   // 0 - 1.0
  voiceLang?: string;
};

export function useAIVoice(options: AIVoiceOptions = {}) {
  const {
    enabled: initialEnabled = true,
    rate = 1.05,
    pitch = 1.0,
    volume = 0.9,
    voiceLang = 'en',
  } = options;

  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const queueRef = useRef<string[]>([]);

  // Load available voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);

      // Pick a good English voice
      const preferred = available.find(v =>
        v.lang.startsWith(voiceLang) &&
        (v.name.includes('Samantha') ||  // macOS
         v.name.includes('Google') ||
         v.name.includes('Microsoft') ||
         v.name.includes('English'))
      ) || available.find(v => v.lang.startsWith(voiceLang)) || available[0];

      if (preferred) setSelectedVoice(preferred);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceLang]);

  // Speak a text
  const speak = useCallback((text: string) => {
    if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!text.trim()) return;

    // Clean up the text for speech (remove markdown, emojis, code blocks)
    const cleanText = text
      .replace(/```[\s\S]*?```/g, ' code block ')       // code blocks
      .replace(/`([^`]+)`/g, '$1')                       // inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1')                 // bold
      .replace(/\*([^*]+)\*/g, '$1')                     // italic
      .replace(/#{1,6}\s/g, '')                          // headers
      .replace(/[🎤🤖💡✅❌⚡🔥]/g, '')                   // emojis
      .replace(/\n+/g, '. ')                             // newlines
      .replace(/\s+/g, ' ')                              // multiple spaces
      .trim();

    if (!cleanText) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Process queue
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (next) speak(next);
      }
    };
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [enabled, rate, pitch, volume, selectedVoice]);

  // Stop speaking
  const stop = useCallback(() => {
    if (typeof window === 'undefined') return;
    queueRef.current = [];
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Queue a message (speaks after current one finishes)
  const queue = useCallback((text: string) => {
    if (isSpeaking) {
      queueRef.current.push(text);
    } else {
      speak(text);
    }
  }, [isSpeaking, speak]);

  // Toggle voice on/off
  const toggle = useCallback(() => {
    setEnabled(prev => {
      if (prev) {
        // Turning off - stop any current speech
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    speak,
    stop,
    queue,
    toggle,
    enabled,
    setEnabled,
    isSpeaking,
    voices,
    selectedVoice,
    setSelectedVoice,
  };
}
