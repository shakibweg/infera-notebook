'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FluxEvent {
  type: 'Update' | 'StartOfTurn' | 'EndOfTurn' | 'Error' | 'Open' | 'Close';
  transcript?: string;
  error?: string;
  isFinal?: boolean;
}

export interface UseFluxOptions {
  workerUrl?: string; // e.g. /api/flux/proxy
  sampleRate?: number;
  isMuted?: boolean;
  onEvent?: (event: FluxEvent) => void;
}

/**
 * Custom hook for Flux Conversational ASR.
 * Handles WebSocket communication with a proxy server to stream linear16 PCM audio
 * and receive real-time transcripts.
 *
 * @param options - Configuration including target sample rate and event callbacks.
 */
export function useFlux({
  workerUrl = '/api/flux/proxy',
  sampleRate = 16000,
  isMuted = false,
  onEvent,
}: UseFluxOptions = {}) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stopRecording = useCallback(() => {
    setIsRecording(false);

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setPartialTranscript('');
    setIsConnecting(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (wsRef.current) return;

    setPartialTranscript('');
    setLastTranscript('');
    setIsConnecting(true);
    try {
      // 1. Get authenticated URL from server
      const configRes = await fetch('/api/flux/config');
      if (!configRes.ok) throw new Error('Failed to get ASR configuration');
      const { url, token } = await configRes.json();

      // Append token to URL
      const socketUrl = new URL(url);
      if (token) {
        socketUrl.searchParams.set('token', token);
      }
      const authenticatedUrl = socketUrl.toString();

      // 2. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Initialize WebSocket
      console.log('[useFlux] Connecting via authenticated config...');
      const ws = new WebSocket(authenticatedUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useFlux] WebSocket opened with server-side token.');
        onEventRef.current?.({ type: 'Open' });
        setIsRecording(true);
        setIsConnecting(false);
      };

      ws.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          const eventType = data.event;

          if (eventType === 'Update') {
            setPartialTranscript(data.transcript || '');
            onEventRef.current?.({ type: 'Update', transcript: data.transcript });
          } else if (eventType === 'StartOfTurn') {
            onEventRef.current?.({ type: 'StartOfTurn' });
          } else if (eventType === 'EndOfTurn') {
            const finalTranscript = data.transcript || '';
            setLastTranscript((prev) => prev + ' ' + finalTranscript);
            setPartialTranscript('');
            onEventRef.current?.({ type: 'EndOfTurn', transcript: finalTranscript, isFinal: true });
          }
        } catch (e) {
          console.error('[useFlux] Error parsing message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[useFlux] WebSocket connection failed. Verify server config.');
        onEventRef.current?.({ type: 'Error', error: 'ASR connectivity issue' });
      };

      ws.onclose = (event) => {
        console.log(`[useFlux] Connection closed: ${event.code}`);
        onEventRef.current?.({ type: 'Close' });
        stopRecording();
      };

      // 4. Audio Processing (linear16, 16-bit PCM)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN || isMutedRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const currentSampleRate = audioContext.sampleRate;
        const downsampled = downsampleBuffer(inputData, currentSampleRate, sampleRate);
        const pcmData = convertFloat32ToLinear16(downsampled);
        ws.send(pcmData.buffer);
      };
    } catch (error) {
      console.error('Failed to start Flux session:', error);
      onEventRef.current?.({
        type: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setIsConnecting(false);
      stopRecording();
    }
  }, [workerUrl, sampleRate, onEvent, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isConnecting,
    lastTranscript,
    partialTranscript,
    setLastTranscript,
    stream: streamRef.current,
  };
}

/**
 * Convert Float32Array (Web Audio format) to Int16Array (PCM Linear16).
 * This is required for most industrial ASR/TTS systems.
 */
function convertFloat32ToLinear16(buffer: Float32Array) {
  const l = buffer.length;
  const buf = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buf;
}

/**
 * Simple interpolation-based downsampler.
 * Reduces the sample rate of a buffer to match the ASR model's expected frequency.
 */
function downsampleBuffer(buffer: Float32Array, sampleRate: number, targetSampleRate: number) {
  if (targetSampleRate === sampleRate) return buffer;
  if (targetSampleRate > sampleRate) {
    console.warn('Upsampling not supported, sending raw buffer.');
    return buffer;
  }

  const sampleRateRatio = sampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}
