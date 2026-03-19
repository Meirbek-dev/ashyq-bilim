/**
 * Shared AI types used across all AI context providers.
 *
 * These types live here (not in a component file) so that context modules
 * do not have circular imports with the components that consume them.
 */

export interface AIMessage {
  sender: 'ai' | 'user';
  message: string;
}

export interface AIError {
  isError: boolean;
  status: number;
  error_message: string;
  /** Machine-readable code from the backend SSE error event (e.g. 'AI_TIMEOUT_ERROR'). */
  error_code?: string;
}

export const INITIAL_AI_ERROR: AIError = {
  isError: false,
  status: 0,
  error_message: '',
};
