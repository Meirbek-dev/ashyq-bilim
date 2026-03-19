'use client';

import { sendActivityAIChatMessageStream, startActivityAIChatSessionStream } from '@services/ai/ai-streaming';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { INITIAL_AI_ERROR } from '@components/Contexts/AI/AIBaseContext';
import type { AIMessage } from '@components/Contexts/AI/AIBaseContext';

// Minimal dispatcher shape — compatible with both AIChatBotContext and
// any other context that shares the same action vocabulary.
type AIDispatch = React.Dispatch<{
  type:
    | 'addMessage'
    | 'setAichat_uuid'
    | 'setIsWaitingForResponse'
    | 'setIsNoLongerWaitingForResponse'
    | 'setChatInputValue'
    | 'setStreamingMessage'
    | 'clearStreamingMessage'
    | 'setStatusMessage'
    | 'setError';
  payload?: any;
}>;

export interface UseActivityChatOptions {
  activityUuid: string;
  accessToken: string | undefined;
  /** Current chat session UUID from context (null = start a new session). */
  chatUuid: string | null;
  /** The global context dispatch function. */
  dispatch: AIDispatch;
  /**
   * When `true` (default), streaming chunks are accumulated in **local** component
   * state so only this component re-renders during a stream, not every context
   * consumer.
   *
   * Set to `false` when the streaming display lives in a *different* component
   * tree (e.g. AIActionButton → ActivityChatMessageBox) and the context's
   * `streamingMessage` field must be kept in sync for display.
   */
  localStreamingDisplay?: boolean;
  /**
   * Message shown while waiting for the first response chunk.
   * Pass a localised string from the call site (e.g. `t('thinking')`).
   * Defaults to `'Thinking...'` if not provided.
   */
  thinkingMessage?: string;
}

export interface UseActivityChatReturn {
  sendMessage: (message: string) => Promise<void>;
  /** Live streaming text — only populated when `localStreamingDisplay` is true. */
  localStreamingText: string;
  /** In-flight status hint ("Thinking…", "Reading document…", etc.) */
  statusMessage: string | null;
  /** Whether a stream is currently in flight (local tracking). */
  isLocalStreaming: boolean;
  /** Abort the current in-flight stream. */
  cancelStream: () => void;
  /** Call this in a cleanup effect on component unmount. */
  cleanup: () => void;
}

/**
 * Encapsulates all AI chat streaming logic.
 *
 * Extracts `sendMessage`, AbortController management, and streaming
 * buffer handling out of view components. Streaming chunks are kept
 * in **local** state by default to prevent unnecessary re-renders of
 * unrelated context consumers during high-frequency token updates.
 */
export function useActivityChat({
  activityUuid,
  accessToken,
  chatUuid,
  dispatch,
  localStreamingDisplay = true,
  thinkingMessage,
}: UseActivityChatOptions): UseActivityChatReturn {
  const [localStreamingText, setLocalStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLocalStreaming, setIsLocalStreaming] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const streamingBufferRef = useRef('');
  const chatUuidRef = useRef<string | null>(chatUuid);
  // Throttle timer: flush streaming-text state updates at most every 50 ms so
  // high-frequency token events don't trigger a React render per token.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    chatUuidRef.current = chatUuid;
  }, [chatUuid]);

  /** Cancel any pending throttle flush and clear local refs (safe to call on unmount). */
  const _clearLocalRefs = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    streamingBufferRef.current = '';
  }, []);

  /**
   * Abort in-flight stream without touching React state.
   * Safe to call from an unmount cleanup effect.
   */
  const cleanup = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    _clearLocalRefs();
  }, [_clearLocalRefs]);

  /**
   * User-triggered cancel: abort stream AND reset all UI state.
   */
  const cancelStream = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    _clearLocalRefs();
    setLocalStreamingText('');
    setStatusMessage(null);
    setIsLocalStreaming(false);
    startTransition(() => dispatch({ type: 'setIsNoLongerWaitingForResponse' }));
    if (!localStreamingDisplay) {
      dispatch({ type: 'clearStreamingMessage' });
      dispatch({ type: 'setStatusMessage', payload: null });
    }
  }, [dispatch, localStreamingDisplay, _clearLocalRefs]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || !accessToken) return;

      // Clear any previous error state so stale errors don't linger.
      dispatch({ type: 'setError', payload: INITIAL_AI_ERROR });

      // Add the user's message to the committed message list immediately.
      dispatch({ type: 'addMessage', payload: { sender: 'user', message } as AIMessage });
      dispatch({ type: 'setChatInputValue', payload: '' });
      startTransition(() => dispatch({ type: 'setIsWaitingForResponse' }));

      // Reset streaming state.
      streamingBufferRef.current = '';
      setLocalStreamingText('');
      setStatusMessage(thinkingMessage ?? 'Thinking...');
      setIsLocalStreaming(true);

      // Cancel any in-flight stream before starting a new one.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // ── Streaming callbacks ────────────────────────────────────────
      /** Flush the accumulated buffer to React state (at most every 50 ms). */
      const scheduleFlush = () => {
        if (flushTimerRef.current !== null) return;
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          const text = streamingBufferRef.current;
          if (localStreamingDisplay) {
            setLocalStreamingText(text);
          } else {
            dispatch({ type: 'setStreamingMessage', payload: text });
          }
        }, 50);
      };

      const handleChunk = (chunk: { content?: string }) => {
        if (!chunk.content) return;
        streamingBufferRef.current += chunk.content;
        scheduleFlush();
      };

      const handleStatus = (status: { aichat_uuid?: string; message?: string }) => {
        if (status.aichat_uuid) {
          startTransition(() => dispatch({ type: 'setAichat_uuid', payload: status.aichat_uuid ?? null }));
        }
        setStatusMessage(status.message ?? null);
        if (!localStreamingDisplay) {
          dispatch({ type: 'setStatusMessage', payload: status.message ?? null });
        }
      };

      const handleComplete = (final: { content?: string; aichat_uuid?: string }) => {
        if (final.aichat_uuid) {
          startTransition(() => dispatch({ type: 'setAichat_uuid', payload: final.aichat_uuid ?? null }));
        }

        // Cancel any pending throttle flush and commit the full final text immediately.
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }

        // Backward compat: backend may send `content` or legacy `message` key.
        const finalMessage = final.content ?? (final as any).message ?? streamingBufferRef.current;
        dispatch({
          type: 'addMessage',
          payload: { sender: 'ai', message: finalMessage } as AIMessage,
        });

        // Clear all streaming state.
        streamingBufferRef.current = '';
        setLocalStreamingText('');
        setStatusMessage(null);
        setIsLocalStreaming(false);
        controllerRef.current = null;

        if (!localStreamingDisplay) {
          dispatch({ type: 'clearStreamingMessage' });
          dispatch({ type: 'setStatusMessage', payload: null });
        }

        startTransition(() => dispatch({ type: 'setIsNoLongerWaitingForResponse' }));
      };

      const handleError = (error: { error?: string; error_code?: string; status?: string | number }) => {
        const errorStatus = typeof error.status === 'number' ? error.status : 500;
        dispatch({
          type: 'setError',
          payload: {
            isError: true,
            status: errorStatus,
            error_code: error.error_code,
            error_message: error.error || 'Streaming failed',
          },
        });

        // Cancel any pending throttle flush.
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }

        streamingBufferRef.current = '';
        setLocalStreamingText('');
        setStatusMessage(null);
        setIsLocalStreaming(false);
        controllerRef.current = null;

        if (!localStreamingDisplay) {
          dispatch({ type: 'clearStreamingMessage' });
          dispatch({ type: 'setStatusMessage', payload: null });
        }

        startTransition(() => dispatch({ type: 'setIsNoLongerWaitingForResponse' }));
      };

      // ── Fire the right endpoint ────────────────────────────────────
      try {
        if (chatUuidRef.current) {
          await sendActivityAIChatMessageStream(
            message,
            chatUuidRef.current,
            activityUuid,
            accessToken,
            handleChunk,
            handleStatus,
            handleComplete,
            handleError,
            controller.signal,
          );
        } else {
          await startActivityAIChatSessionStream(
            message,
            activityUuid,
            accessToken,
            handleChunk,
            handleStatus,
            handleComplete,
            handleError,
            controller.signal,
          );
        }
      } catch (error) {
        handleError({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    },
    [accessToken, activityUuid, dispatch, localStreamingDisplay, thinkingMessage],
  );

  return { sendMessage, localStreamingText, statusMessage, isLocalStreaming, cancelStream, cleanup };
}
