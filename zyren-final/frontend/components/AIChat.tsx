'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, User, Send, Sparkles } from 'lucide-react';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
};

type AIChatProps = {
  messages: Message[];
  isTyping: boolean;
  onSendMessage: (text: string) => void;
  patterns?: string[];
};

export default function AIChat({ messages, isTyping, onSendMessage, patterns }: AIChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const patternLabels: Record<string, { label: string; color: string }> = {
    nested_loops: { label: 'Nested Loops', color: 'text-amber-400' },
    recursion: { label: 'Recursion', color: 'text-cyan-400' },
    brute_force: { label: 'Brute Force', color: 'text-rose-400' },
    sorting: { label: 'Sorting', color: 'text-emerald-400' },
    hash_map: { label: 'Hash Map', color: 'text-violet-400' },
    no_error_handling: { label: 'No Error Handling', color: 'text-orange-400' },
    modular_code: { label: 'Modular Code', color: 'text-green-400' },
    syntax_error: { label: 'Syntax Error', color: 'text-red-400' },
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">AI Interviewer</h3>
          <p className="text-xs text-white/40">Powered by Llama 3.2</p>
        </div>
        {isTyping && (
          <div className="ml-auto badge-brand text-xs">
            <Sparkles className="w-3 h-3 mr-1" /> Thinking...
          </div>
        )}
      </div>

      {/* ─── Pattern Indicators ─── */}
      {patterns && patterns.length > 0 && (
        <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-2">
          {patterns.map((p) => {
            const info = patternLabels[p] || { label: p, color: 'text-white/60' };
            return (
              <span key={p} className={`text-xs font-medium ${info.color} bg-white/5 px-2 py-1 rounded-md`}>
                {info.label}
              </span>
            );
          })}
        </div>
      )}

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(m => m.role !== 'system').map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={msg.role === 'user' ? 'chat-message-user' : 'chat-message-ai'}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="chat-message-ai">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input ─── */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your response..."
            className="input-field flex-1 text-sm py-2.5"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="btn-primary px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
