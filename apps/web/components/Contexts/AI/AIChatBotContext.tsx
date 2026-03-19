'use client';

import type { BaseChatState, BaseChatAction } from '@components/Contexts/AI/createAIChatContext';
import { createAIChatContext } from '@components/Contexts/AI/createAIChatContext';

// ── Extra state & actions specific to the chat-bot UI ────────────────────────

type AIChatBotExtraAction =
  | { type: 'setStreamingMessage'; payload: string }
  | { type: 'clearStreamingMessage' }
  | { type: 'setStatusMessage'; payload: string | null };

interface AIChatBotExtraState {
  streamingMessage: string;
  statusMessage: string | null;
}

function chatBotExtraReducer(state: AIChatBotExtraState, action: AIChatBotExtraAction): AIChatBotExtraState {
  switch (action.type) {
    case 'setStreamingMessage': {
      return { ...state, streamingMessage: action.payload };
    }
    case 'clearStreamingMessage': {
      return { ...state, streamingMessage: '' };
    }
    case 'setStatusMessage': {
      return { ...state, statusMessage: action.payload };
    }
    default: {
      return state;
    }
  }
}

// ── Build context from factory ────────────────────────────────────────────────

const {
  Provider: AIChatBotProvider_,
  useState: useAIChatBotState,
  useDispatch: useAIChatBotDispatch_,
  StateContext: AIChatBotContext_,
  DispatchContext: AIChatBotDispatchContext_,
} = createAIChatContext<AIChatBotExtraState, AIChatBotExtraAction>(
  { streamingMessage: '', statusMessage: null },
  chatBotExtraReducer,
);

// ── Public type exports ───────────────────────────────────────────────────────

export type AIChatBotAction = BaseChatAction | AIChatBotExtraAction;

export interface AIChatBotStateTypes extends BaseChatState, AIChatBotExtraState {}

// ── Backward-compatible named exports ────────────────────────────────────────
// TODO: Fully migrate to the new named exports and remove these aliases.
export const AIChatBotContext = AIChatBotContext_;
export const AIChatBotDispatchContext = AIChatBotDispatchContext_;
export default AIChatBotProvider_;

export function useAIChatBot(): AIChatBotStateTypes {
  return useAIChatBotState() as AIChatBotStateTypes;
}

export function useAIChatBotDispatch(): React.Dispatch<AIChatBotAction> {
  return useAIChatBotDispatch_() as React.Dispatch<AIChatBotAction>;
}
