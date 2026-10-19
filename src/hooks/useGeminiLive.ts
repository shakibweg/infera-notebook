'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GeminiLiveAPIClient,
  MultimodalLiveResponseType,
  LiveResponse,
} from '@/lib/llm/live-api-client';
import { AudioStreamer, AudioPlayer } from '@/lib/llm/media-utils';

export type GeminiLiveState = 'idle' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveCallbacks {
  onAudioData?: (base64Audio: string) => void;
  onOutputTranscription?: (text: string) => void;
  onInputTranscription?: (text: string) => void;
  onInterrupted?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: string) => void;
  onSetupComplete?: () => void;
}

export interface UseGeminiLiveOptions {
  systemInstruction?: string;
  voice?: string;
  isMuted?: boolean;
  callbacks?: GeminiLiveCallbacks;
}

export function useGeminiLive(options: UseGeminiLiveOptions = {}) {
  const { systemInstruction, voice, isMuted: initialIsMuted = false, callbacks } = options;

  const [state, setState] = useState<GeminiLiveState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [inputTranscript, setInputTranscript] = useState('');
  const [outputTranscript, setOutputTranscript] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(initialIsMuted);
  const [volume, setVolumeState] = useState(1.0);

  const clientRef = useRef<GeminiLiveAPIClient | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const disconnect = useCallback(() => {
    if (streamerRef.current) {
      streamerRef.current.destroy();
      streamerRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setState('idle');
    setStream(null);
    setInputTranscript('');
    setOutputTranscript('');
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    playerRef.current?.setVolume(value);
  }, []);

  const connect = useCallback(async () => {
    if (clientRef.current) return;

    setState('connecting');
    setInputTranscript('');
    setOutputTranscript('');

    try {
      // 1. Get ephemeral token
      const res = await fetch('/api/live/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const { token } = await res.json();
      const model = 'gemini-3.1-flash-live-preview';

      // 2. Initialize client
      const client = new GeminiLiveAPIClient(token, model, {
        systemInstructions: systemInstruction,
        voiceName: voice,
      });

      // 3. Set up callbacks
      client.onOpen = () => {
        console.log('[GeminiLive] WebSocket opened, waiting for setup complete...');
        callbacksRef.current?.onOpen?.();
      };

      client.onClose = () => {
        disconnect();
        callbacksRef.current?.onClose?.();
      };

      client.onReceiveResponse = (response: LiveResponse) => {
        switch (response.type) {
          case MultimodalLiveResponseType.SETUP_COMPLETE:
            console.log('[GeminiLive] Setup complete!');
            setState('connected');
            callbacksRef.current?.onSetupComplete?.();
            break;

          case MultimodalLiveResponseType.AUDIO:
            playerRef.current?.play(response.data);
            callbacksRef.current?.onAudioData?.(response.data);
            break;

          case MultimodalLiveResponseType.INPUT_TRANSCRIPTION:
            // Input transcription (user) is replacement-based until finished
            const userText = response.data.text || '';
            setInputTranscript(userText);

            // Clear output transcript when user starts speaking (new turn)
            setOutputTranscript('');

            callbacksRef.current?.onInputTranscription?.(userText);
            break;

          case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION:
            // Output transcription (AI) is delta-based
            const aiText = response.data.text || '';
            setOutputTranscript((prev) => prev + aiText);
            callbacksRef.current?.onOutputTranscription?.(aiText);
            break;

          case MultimodalLiveResponseType.INTERRUPTED:
            playerRef.current?.interrupt();
            // Clear pending output on interruption
            setOutputTranscript('');
            callbacksRef.current?.onInterrupted?.();
            break;

          case MultimodalLiveResponseType.ERROR:
            console.error('[GeminiLive] Model error:', response.data);
            callbacksRef.current?.onError?.(response.data.message || 'Model error');
            break;
        }
      };

      client.onError = (err) => {
        setState('error');
        callbacksRef.current?.onError?.(err);
      };

      // 4. Initialize media tools
      playerRef.current = new AudioPlayer();
      await playerRef.current.init();

      streamerRef.current = new AudioStreamer(client);

      // 5. Connect
      clientRef.current = client;
      client.connect();
    } catch (error) {
      console.error('[GeminiLive] Connection failed:', error);
      setState('error');
      disconnect();
    }
  }, [systemInstruction, voice, disconnect]);

  const sendText = useCallback((text: string) => {
    if (clientRef.current) {
      clientRef.current.sendTextMessage(text);
    }
  }, []);

  // Control mic state based on isMuted prop
  useEffect(() => {
    if (streamerRef.current) {
      if (isMuted) {
        streamerRef.current.stop();
        setStream(null);
      } else if (state === 'connected') {
        streamerRef.current.start().then(() => {
          setStream(streamerRef.current?.getStream() || null);
        });
      }
    }
  }, [isMuted, state]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendText,
    state,
    inputTranscript,
    outputTranscript,
    setInputTranscript,
    setOutputTranscript,
    stream,
    isMuted,
    setIsMuted,
    setVolume,
    volume,
    isConnected: state === 'connected',
    isConnecting: state === 'connecting',
  };
}
