/**
 * AI Service — Streaming + Non-Streaming
 *
 * Single source of truth for all AI network calls. The non-streaming helpers
 * are kept here for completeness; streaming variants should be preferred for
 * all interactive chat flows.
 */

import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';

interface AIStreamChunk {
  type: 'status' | 'chunk' | 'final' | 'error';
  /** Session UUID returned by the backend on the first status event. */
  aichat_uuid?: string;
  /** Status string on status events (e.g. 'processing') or HTTP status code on error events (e.g. 404, 503). */
  status?: string | number;
  message?: string;
  content?: string;
  chunk_id?: number;
  total_chunks?: number;
  error?: string;
  error_code?: string;
}

interface SSECallbacks {
  onChunk?: (chunk: AIStreamChunk) => void;
  onStatus?: (chunk: AIStreamChunk) => void;
  onComplete?: (chunk: AIStreamChunk) => void;
  onError?: (chunk: AIStreamChunk) => void;
}

/**
 * Shared SSE stream reader.
 * Handles buffer management, event dispatch, and abort for both
 * `startActivityAIChatSessionStream` and `sendActivityAIChatMessageStream`.
 */
async function readSSEStream(response: Response, callbacks: SSECallbacks, signal?: AbortSignal): Promise<void> {
  if (!response.body) throw new Error('Response body is null');
  const { onChunk, onStatus, onComplete, onError } = callbacks;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedContent = '';

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      break;
    }

    const { done, value } = await reader.read();

    if (done) {
      onComplete?.({ type: 'final', content: accumulatedContent });
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const chunk: AIStreamChunk = JSON.parse(line.slice(6));
        switch (chunk.type) {
          case 'status': {
            onStatus?.(chunk);
            break;
          }
          case 'chunk': {
            if (chunk.content) accumulatedContent += chunk.content;
            onChunk?.(chunk);
            break;
          }
          case 'final': {
            onComplete?.(chunk);
            return;
          }
          case 'error': {
            onError?.(chunk);
            return;
          }
          default: {
            break;
          }
        }
      } catch {
        console.error('Failed to parse SSE chunk:', line);
      }
    }
  }
}

/**
 * Provides real-time AI responses
 *
 * @param message - User's message
 * @param activity_uuid - Activity UUID
 * @param access_token - Authentication token
 * @param onChunk - Callback for each response chunk
 * @param onStatus - Callback for status updates
 * @param onComplete - Callback when response is complete
 * @param onError - Callback for errors
 *
 * @example
 * ```typescript
 * await startActivityAIChatSessionStream(
 *   "What is this course about?",
 *   "activity_123",
 *   token,
 *   (chunk) => setDisplayText(prev => prev + chunk.content),
 *   (status) => setStatus(status.message),
 *   (final) => {
 *     setDisplayText(final.content);
 *     setLoading(false);
 *   },
 *   (error) => showError(error.error)
 * );
 * ```
 */
export async function startActivityAIChatSessionStream(
  message: string,
  activity_uuid: string,
  access_token: string,
  onChunk?: (chunk: AIStreamChunk) => void,
  onStatus?: (status: AIStreamChunk) => void,
  onComplete?: (final: AIStreamChunk) => void,
  onError?: (error: AIStreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const data = { message, activity_uuid };
    const requestInit = RequestBodyWithAuthHeader('POST', data, null, access_token);
    if (signal) requestInit.signal = signal;
    const response = await fetch(`${getAPIUrl()}ai/start/activity_chat_session_stream`, requestInit);
    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      let error_code: string | undefined;
      try {
        const body = await response.json();
        errorMessage = body?.detail ?? body?.error ?? errorMessage;
        error_code = body?.error_code;
      } catch {
        /* non-JSON body */
      }
      onError?.({ type: 'error', error: errorMessage, status: response.status, error_code });
      return;
    }
    await readSSEStream(response, { onChunk, onStatus, onComplete, onError }, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof Error && error.name === 'AbortError') return;
    console.error('AI streaming failed:', error);
    onError?.({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      error_code: 'STREAM_ERROR',
    });
  }
}

export async function sendActivityAIChatMessageStream(
  message: string,
  aichat_uuid: string,
  activity_uuid: string,
  access_token: string,
  onChunk?: (chunk: AIStreamChunk) => void,
  onStatus?: (status: AIStreamChunk) => void,
  onComplete?: (final: AIStreamChunk) => void,
  onError?: (error: AIStreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const data = { aichat_uuid, message, activity_uuid };
    const requestInit = RequestBodyWithAuthHeader('POST', data, null, access_token);
    if (signal) requestInit.signal = signal;
    const response = await fetch(`${getAPIUrl()}ai/send/activity_chat_message_stream`, requestInit);
    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      let error_code: string | undefined;
      try {
        const body = await response.json();
        errorMessage = body?.detail ?? body?.error ?? errorMessage;
        error_code = body?.error_code;
      } catch {
        /* non-JSON body */
      }
      onError?.({ type: 'error', error: errorMessage, status: response.status, error_code });
      return;
    }
    await readSSEStream(response, { onChunk, onStatus, onComplete, onError }, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof Error && error.name === 'AbortError') return;
    console.error('AI streaming failed:', error);
    onError?.({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      error_code: 'STREAM_ERROR',
    });
  }
}
