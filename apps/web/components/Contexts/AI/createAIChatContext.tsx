/**
 * Generic factory for AI chat context providers.
 *
 * Usage:
 *   const { Provider, useState, useDispatch } = createAIChatContext(
 *     extraInitialState,
 *     extraReducer,
 *   );
 *
 * Both AIChatBotContext and AIEditorContext are built with this factory,
 * eliminating duplicated reducer/provider logic.
 */
'use client';

import type { AIError, AIMessage } from './AIBaseContext';
import type { Dispatch, ReactNode, Reducer } from 'react';
import { createContext, use, useReducer } from 'react';
import { INITIAL_AI_ERROR } from './AIBaseContext';

// ── Base state shared by all AI chat contexts ────────────────────────────────

export interface BaseChatState {
  messages: AIMessage[];
  isModalOpen: boolean;
  aichat_uuid: string | null;
  isWaitingForResponse: boolean;
  chatInputValue: string;
  error: AIError;
}

export type BaseChatAction =
  | { type: 'setMessages'; payload: AIMessage[] }
  | { type: 'addMessage'; payload: AIMessage }
  | { type: 'setIsModalOpen' }
  | { type: 'setIsModalClose' }
  | { type: 'setAichat_uuid'; payload: string | null }
  | { type: 'setIsWaitingForResponse' }
  | { type: 'setIsNoLongerWaitingForResponse' }
  | { type: 'setChatInputValue'; payload: string }
  | { type: 'setError'; payload: AIError }
  | { type: 'resetSession' };

export const BASE_CHAT_INITIAL_STATE: BaseChatState = {
  messages: [],
  isModalOpen: false,
  aichat_uuid: null,
  isWaitingForResponse: false,
  chatInputValue: '',
  error: INITIAL_AI_ERROR,
};

// Action types handled by the base reducer (used to route dispatch correctly)
const BASE_ACTION_TYPES = new Set<string>([
  'setMessages',
  'addMessage',
  'setIsModalOpen',
  'setIsModalClose',
  'setAichat_uuid',
  'setIsWaitingForResponse',
  'setIsNoLongerWaitingForResponse',
  'setChatInputValue',
  'setError',
  'resetSession',
]);

function baseReducer(state: BaseChatState, action: BaseChatAction): BaseChatState {
  switch (action.type) {
    case 'setMessages': {
      return { ...state, messages: action.payload };
    }
    case 'addMessage': {
      return { ...state, messages: [...state.messages, action.payload] };
    }
    case 'setIsModalOpen': {
      return { ...state, isModalOpen: true };
    }
    case 'setIsModalClose': {
      return { ...state, isModalOpen: false };
    }
    case 'setAichat_uuid': {
      return { ...state, aichat_uuid: action.payload };
    }
    case 'setIsWaitingForResponse': {
      return { ...state, isWaitingForResponse: true };
    }
    case 'setIsNoLongerWaitingForResponse': {
      return { ...state, isWaitingForResponse: false };
    }
    case 'setChatInputValue': {
      return { ...state, chatInputValue: action.payload };
    }
    case 'setError': {
      return { ...state, error: action.payload };
    }
    case 'resetSession': {
      return {
        ...state,
        messages: [],
        aichat_uuid: null,
        isWaitingForResponse: false,
        error: INITIAL_AI_ERROR,
        chatInputValue: '',
      };
    }
    default: {
      return state;
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Reducer type for extra actions.
 *
 * Receives the *full* combined state (read-only) so implementations can
 * read base fields (e.g. `messages`) when needed, and returns an object
 * containing the updated extra state fields. It may additionally include
 * partial overrides of base state fields (e.g. `{ messages: [] }`) — those
 * patches are merged into the full state by the combined reducer.
 */
export type ExtraReducer<
  ExtraState extends object,
  ExtraAction extends { type: string },
  FullState extends BaseChatState & ExtraState = BaseChatState & ExtraState,
> = (state: FullState, action: ExtraAction) => ExtraState & Partial<BaseChatState>;

/**
 * Creates a typed context pair (StateContext + DispatchContext) with a
 * combined reducer that handles base actions automatically and delegates
 * unknown action types to the provided `extraReducer`.
 *
 * @param extraInitialState - Additional initial state fields beyond the base.
 * @param extraReducer - Reducer that handles only the extra actions; receives
 *   the *full* combined state so it can read base fields if needed, and may
 *   return partial base-state overrides (e.g. `{ messages: [] }`) alongside
 *   the extra-state fields.
 */
export function createAIChatContext<ExtraState extends object, ExtraAction extends { type: string }>(
  extraInitialState: ExtraState,
  extraReducer: ExtraReducer<ExtraState, ExtraAction>,
) {
  type State = BaseChatState & ExtraState;
  type Action = BaseChatAction | ExtraAction;

  const initialState: State = { ...BASE_CHAT_INITIAL_STATE, ...extraInitialState };

  const StateContext = createContext<State | null>(null);
  const DispatchContext = createContext<Dispatch<Action> | null>(null);

  const combinedReducer: Reducer<State, Action> = (state, action) => {
    if (BASE_ACTION_TYPES.has(action.type)) {
      const base = baseReducer(state as BaseChatState, action as BaseChatAction);
      return { ...state, ...base };
    }
    // Extra reducer receives the full state and may return base-state patches too.
    const patch = extraReducer(state, action as ExtraAction);
    return { ...state, ...patch };
  };

  function Provider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(combinedReducer, initialState);
    return (
      <StateContext.Provider value={state}>
        <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
      </StateContext.Provider>
    );
  }

  function useState_(): State {
    const ctx = use(StateContext);
    if (!ctx) throw new Error('AI context hook must be used inside its Provider');
    return ctx;
  }

  function useDispatch_(): Dispatch<Action> {
    const ctx = use(DispatchContext);
    if (!ctx) throw new Error('AI context dispatch hook must be used inside its Provider');
    return ctx;
  }

  return {
    Provider,
    useState: useState_,
    useDispatch: useDispatch_,
    StateContext,
    DispatchContext,
    initialState,
  };
}
