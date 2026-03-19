'use client';

import type { BaseChatState, BaseChatAction, ExtraReducer } from '@components/Contexts/AI/createAIChatContext';
import { createAIChatContext } from '@components/Contexts/AI/createAIChatContext';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CritisizeScope = 'selection' | 'lecture';

type ToolLabel = 'Writer' | 'ContinueWriting' | 'MakeLonger' | 'GenerateQuiz' | 'Translate' | 'Critisize';

interface AIEditorExtraState {
  isFeedbackModalOpen: boolean;
  selectedTool: ToolLabel;
  isUserInputEnabled: boolean;
  critisizeScope: CritisizeScope;
}

type AIEditorExtraAction =
  | { type: 'setSelectedTool'; payload: ToolLabel }
  | { type: 'setIsFeedbackModalOpen' }
  | { type: 'setIsFeedbackModalClose' }
  | { type: 'setIsUserInputEnabled'; payload: boolean }
  | { type: 'setCritisizeScope'; payload: CritisizeScope };

const editorExtraReducer: ExtraReducer<AIEditorExtraState, AIEditorExtraAction> = (state, action) => {
  switch (action.type) {
    case 'setSelectedTool': {
      // Reset the message history whenever the user switches tools.
      return { ...state, selectedTool: action.payload, messages: [] };
    }
    case 'setIsFeedbackModalOpen': {
      return { ...state, isFeedbackModalOpen: true };
    }
    case 'setIsFeedbackModalClose': {
      return { ...state, isFeedbackModalOpen: false };
    }
    case 'setIsUserInputEnabled': {
      return { ...state, isUserInputEnabled: action.payload };
    }
    case 'setCritisizeScope': {
      return { ...state, critisizeScope: action.payload };
    }
    default: {
      return state;
    }
  }
};

// ── Build context from factory ─────────────────────────────────────────────────

const {
  Provider: AIEditorProvider_,
  useState: useAIEditorState,
  useDispatch: useAIEditorDispatch_,
  StateContext: AIEditorContext_,
  DispatchContext: AIEditorDispatchContext_,
} = createAIChatContext<AIEditorExtraState, AIEditorExtraAction>(
  {
    isFeedbackModalOpen: false,
    selectedTool: 'Writer',
    isUserInputEnabled: true,
    critisizeScope: 'selection',
  },
  editorExtraReducer,
);

// ── Public type exports ────────────────────────────────────────────────────────

export type AIEditorAction = BaseChatAction | AIEditorExtraAction;

export interface AIEditorStateTypes extends BaseChatState, AIEditorExtraState {}

// ── Backward-compatible named exports ─────────────────────────────────────────

export const AIEditorContext = AIEditorContext_;
export const AIEditorDispatchContext = AIEditorDispatchContext_;
export default AIEditorProvider_;

export function useAIEditor(): AIEditorStateTypes {
  return useAIEditorState() as AIEditorStateTypes;
}

export function useAIEditorDispatch(): React.Dispatch<AIEditorAction> {
  return useAIEditorDispatch_() as React.Dispatch<AIEditorAction>;
}
