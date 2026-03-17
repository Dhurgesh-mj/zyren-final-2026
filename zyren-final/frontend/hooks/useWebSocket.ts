'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type WSMessage = {
  type: string;
  [key: string]: any;
};

type UseWebSocketOptions = {
  onMessage?: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (e: Event) => void;
  reconnect?: boolean;
  reconnectDelay?: number;
};

export function useWebSocket(
  urlOrFactory: string | (() => WebSocket),
  options: UseWebSocketOptions = {}
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    try {
      const ws = typeof urlOrFactory === 'string'
        ? new WebSocket(urlOrFactory)
        : urlOrFactory();

      ws.onopen = () => {
        setIsConnected(true);
        optionsRef.current.onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setLastMessage(msg);
          optionsRef.current.onMessage?.(msg);
        } catch {
          // Non-JSON message
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        optionsRef.current.onClose?.();
        
        if (optionsRef.current.reconnect !== false) {
          reconnectTimer.current = setTimeout(() => {
            connect();
          }, optionsRef.current.reconnectDelay || 3000);
        }
      };

      ws.onerror = (e) => {
        optionsRef.current.onError?.(e);
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('WebSocket connection error:', e);
    }
  }, [urlOrFactory]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((data: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    send,
    ws: wsRef,
  };
}
