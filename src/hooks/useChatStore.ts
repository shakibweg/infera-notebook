import { create } from 'zustand';
import { useNotebookStore } from './useNotebookStore';
import { toast } from 'sonner';

/**
 * Zustand store for managing chat state globally.
 * This ensures that chat messages, input values, and streaming status
 * are synchronized across multiple instances of chat panels (e.g., mobile vs desktop).
 */

type ChatStatus = 'idle' | 'streaming' | 'submitted';

interface ChatStore {
  messages: any[];
  setMessages: (messages: any[] | ((prev: any[]) => any[])) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  status: ChatStatus;
  setStatus: (status: ChatStatus) => void;
  isLoadingHistory: boolean;
  setIsLoadingHistory: (loading: boolean) => void;

  // Actions
  fetchMessages: (notebookId: string) => Promise<void>;
  sendMessage: (userMessage: any, options: { body: any }) => Promise<void>;
  handleStop: () => void;
  clearMessages: () => void;
}

let abortController: AbortController | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  setMessages: (messages) => {
    if (typeof messages === 'function') {
      set((state) => ({ messages: messages(state.messages) }));
    } else {
      set({ messages });
    }
  },
  inputValue: '',
  setInputValue: (inputValue) => set({ inputValue }),
  status: 'idle',
  setStatus: (status) => set({ status }),
  isLoadingHistory: false,
  setIsLoadingHistory: (isLoadingHistory) => set({ isLoadingHistory }),

  fetchMessages: async (notebookId: string) => {
    if (!notebookId) return;

    try {
      set({ isLoadingHistory: true });
      const response = await fetch(`/api/notebooks/${notebookId}/messages`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      set({ messages: data.messages || [] });
    } catch (error) {
      console.error('[ChatStore] Failed to fetch messages:', error);
      set({ messages: [] });
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  handleStop: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    set((state) => {
      const messages = state.messages;
      if (messages.length === 0) return { status: 'idle' };

      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts)) return { status: 'idle' };

      const updatedParts = lastMsg.parts.map((part: any) => {
        if (part.type === 'reasoning' && (part.isStreaming || part.state === 'input-streaming')) {
          return {
            ...part,
            isStreaming: false,
            state: part.state === 'input-streaming' ? 'input-available' : part.state,
          };
        }
        return part;
      });

      return {
        messages: [...messages.slice(0, -1), { ...lastMsg, parts: updatedParts }],
        status: 'idle',
      };
    });
  },

  sendMessage: async (userMessage, options) => {
    const { status, messages } = get();
    if (status !== 'idle') return;

    // Abort old request if any
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    const signal = abortController.signal;

    // 1. Add user message optimistically
    const newUserMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: userMessage.parts,
      createdAt: new Date(),
    };

    const updatedMessages = [...messages, newUserMessage];
    set({ messages: updatedMessages, status: 'submitted' });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: Array.isArray(m.parts)
              ? m.parts.find((p: any) => p.type === 'text')?.text || ''
              : '',
            parts: m.parts,
            toolInvocations: m.toolInvocations || [],
          })),
          ...options.body,
        }),
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error && errorData.error.includes('Credits exhausted')) {
          toast.error('Credits exhausted. Please wait for the daily reset.');
        } else {
          toast.error(errorData.error || 'Internal Server Error');
        }
        set({ status: 'idle' });
        return;
      }

      set({ status: 'streaming' });
      useNotebookStore.getState().fetchCredits(); // Use notebook store to refresh credits

      // 2. Prepare assistant message
      const assistantMessageId = crypto.randomUUID();
      const initialAssistantMessage = {
        id: assistantMessageId,
        role: 'assistant',
        parts: [],
        createdAt: new Date(),
      };
      set((state) => ({ messages: [...state.messages, initialAssistantMessage] }));

      // 3. Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              set((state) => {
                const newMsgs = state.messages.map((msg) => {
                  if (msg.id !== assistantMessageId) return msg;

                  const updatedParts = [...msg.parts];

                  if (data.type === 'text' || data.type === 'tool_call') {
                    const reasoningPartIndex = updatedParts.findIndex(
                      (p: any) => p.type === 'reasoning'
                    );
                    if (reasoningPartIndex !== -1 && updatedParts[reasoningPartIndex].isStreaming) {
                      updatedParts[reasoningPartIndex] = {
                        ...updatedParts[reasoningPartIndex],
                        isStreaming: false,
                      };
                    }
                  }

                  if (data.type === 'text') {
                    const textPartIndex = updatedParts.findIndex((p: any) => p.type === 'text');
                    if (textPartIndex === -1) {
                      updatedParts.push({ type: 'text', text: data.content });
                    } else {
                      updatedParts[textPartIndex] = {
                        ...updatedParts[textPartIndex],
                        text: updatedParts[textPartIndex].text + data.content,
                      };
                    }
                  } else if (data.type === 'reasoning') {
                    const reasoningPartIndex = updatedParts.findIndex(
                      (p: any) => p.type === 'reasoning'
                    );
                    if (reasoningPartIndex === -1) {
                      updatedParts.push({
                        type: 'reasoning',
                        reasoning: data.content,
                        isStreaming: true,
                      });
                    } else {
                      updatedParts[reasoningPartIndex] = {
                        ...updatedParts[reasoningPartIndex],
                        reasoning: updatedParts[reasoningPartIndex].reasoning + data.content,
                      };
                    }
                  } else if (data.type === 'tool_call') {
                    updatedParts.push({
                      type: `tool-${data.name}`,
                      toolCallId: data.id,
                      args: data.args,
                      state: 'input-streaming',
                    });
                  } else if (data.type === 'tool_result') {
                    const toolPartIndex = updatedParts.findIndex(
                      (p: any) => p.toolCallId === data.id
                    );
                    if (toolPartIndex !== -1) {
                      updatedParts[toolPartIndex] = {
                        ...updatedParts[toolPartIndex],
                        state: 'output-available',
                        output: data.result,
                      };
                    }
                  }

                  return { ...msg, parts: updatedParts };
                });
                return { messages: newMsgs };
              });
            } catch (e) {
              // Ignore incomplete chunks
            }
          }
        }
      }

      // 4. Success: Finish streaming
      set((state) => {
        const messages = state.messages;
        if (messages.length === 0) return { status: 'idle' };

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts))
          return { status: 'idle' };

        const updatedParts = lastMsg.parts.map((part: any) => {
          if (part.type === 'reasoning' && part.isStreaming) {
            return { ...part, isStreaming: false };
          }
          return part;
        });

        return {
          messages: [...messages.slice(0, -1), { ...lastMsg, parts: updatedParts }],
          status: 'idle',
        };
      });
      abortController = null;
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('[ChatStore] Streaming Error:', error);
      toast.error('Internal Server Error');
      if (abortController?.signal === signal) {
        abortController = null;
      }

      set((state) => {
        const messages = state.messages;
        if (messages.length === 0) return { status: 'idle' };

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant' || !Array.isArray(lastMsg.parts))
          return { status: 'idle' };

        const updatedParts = lastMsg.parts.map((part: any) => {
          if (part.type === 'reasoning' && part.isStreaming) {
            return { ...part, isStreaming: false };
          }
          return part;
        });

        return {
          messages: [...messages.slice(0, -1), { ...lastMsg, parts: updatedParts }],
          status: 'idle',
        };
      });

      if (abortController?.signal === signal) {
        abortController = null;
      }
    }
  },
  clearMessages: () => set({ messages: [] }),
}));
