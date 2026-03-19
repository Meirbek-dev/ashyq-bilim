import {
  AlertTriangle,
  BetweenHorizontalStart,
  FastForward,
  Feather,
  FileStack,
  HelpCircle,
  Languages,
  Lightbulb,
  X,
} from 'lucide-react';
import { sendActivityAIChatMessageStream, startActivityAIChatSessionStream } from '@services/ai/ai-streaming';
import { useAIEditor, useAIEditorDispatch } from '@components/Contexts/AI/AIEditorContext';
import type { CritisizeScope } from '@components/Contexts/AI/AIEditorContext';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import platformLogoLight from '@public/platform_logo_light.svg';
import { ScrollArea } from '@components/ui/scroll-area';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef } from 'react';
import type { Variants } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { marked } from 'marked';
import Image from 'next/image';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

type ToolLabel = 'Writer' | 'ContinueWriting' | 'MakeLonger' | 'GenerateQuiz' | 'Translate' | 'Critisize';

interface AIEditorToolkitProps {
  editor: Editor;
  activity: { activity_uuid: string };
}

interface AIPromptsLabels {
  label: ToolLabel;
  selection: string;
  scope?: CritisizeScope;
  targetLanguage?: string;
}

// ============================================================================
// Constants
// ============================================================================

// Delay per word (ms) when typing AI responses into the editor. Reduced for snappier UX.
const TYPING_DELAY_MS = 45;

const MODAL_VARIANTS: Variants = {
  hidden: { y: 20, opacity: 0, filter: 'blur(10px)', scale: 0.95 },
  visible: { y: 0, opacity: 1, filter: 'blur(0px)', scale: 1 },
  exit: { y: 30, opacity: 0, filter: 'blur(8px)', scale: 0.98 },
};

const FEEDBACK_MODAL_VARIANTS: Variants = {
  hidden: { y: 30, opacity: 0, filter: 'blur(10px)', scale: 0.9 },
  visible: { y: 0, opacity: 1, filter: 'blur(0px)', scale: 1 },
  exit: { y: 40, opacity: 0, filter: 'blur(8px)', scale: 0.95 },
};

const SPRING_TRANSITION: any = { type: 'spring', bounce: 0.2, duration: 0.55 };
const SPRING_TRANSITION_SLOW: any = { type: 'spring', bounce: 0.2, duration: 0.7 };

const GLASS_BACKGROUND = `
  linear-gradient(135deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.08) 100%
  ),
  linear-gradient(180deg,
    oklch(0.35 0.15 260 / 0.7) 0%,
    oklch(0.28 0.12 262 / 0.6) 100%
  )
`;

const FEEDBACK_GLASS_BACKGROUND = `
  linear-gradient(135deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.08) 100%
  ),
  linear-gradient(180deg,
    oklch(0.36 0.16 260 / 0.75) 0%,
    oklch(0.28 0.12 262 / 0.65) 100%
  )
`;

const TOOL_ICONS: Record<ToolLabel, typeof Feather> = {
  Writer: Feather,
  ContinueWriting: FastForward,
  MakeLonger: FileStack,
  GenerateQuiz: HelpCircle,
  Translate: Languages,
  Critisize: Lightbulb,
};

// ============================================================================
// Utility Functions
// ============================================================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeSentences(textToRemove: string, originalText: string): string {
  if (!textToRemove) return originalText;
  try {
    const regex = new RegExp(escapeRegex(textToRemove), 'gi');
    return originalText.replace(regex, '');
  } catch {
    return originalText;
  }
}

// ============================================================================
// Reusable Components
// ============================================================================

function GlassOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-br from-white/20 via-transparent to-transparent opacity-60" />
  );
}

function VerticalDivider() {
  return <div className="hidden h-8 w-px bg-linear-to-b from-transparent via-white/30 to-transparent sm:block" />;
}

interface IconButtonProps {
  onClick: () => void;
  label: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  children: ReactNode;
}

function IconButton({ onClick, label, variant = 'default', disabled, children }: IconButtonProps) {
  const baseClasses =
    'group relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl backdrop-blur-sm transition-all duration-300 focus:ring-2 focus:ring-white/40 focus:outline-none active:scale-95 sm:h-10 sm:w-10';
  const variantClasses =
    variant === 'danger'
      ? 'bg-white/10 text-white/80 hover:bg-red-500/30 hover:text-white'
      : 'bg-linear-to-br from-white/25 to-white/15 shadow-lg hover:scale-105 hover:from-white/35 hover:to-white/20 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100';

  return (
    <button
      onClick={onClick}
      aria-label={label}
      type="button"
      disabled={disabled}
      className={`${baseClasses} ${variantClasses}`}
    >
      <div className="absolute inset-0 bg-white/15 opacity-0 transition-opacity group-hover:opacity-100" />
      {children}
    </button>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  label: string;
  icon: typeof Feather;
  hoverColor?: string;
}

function ActionButton({ onClick, label, icon: Icon, hoverColor = 'purple' }: ActionButtonProps) {
  const colorMap: Record<string, string> = {
    purple: 'from-purple-400/30 to-blue-400/30 hover:shadow-purple-500/30',
    blue: 'from-blue-400/30 to-cyan-400/30 hover:shadow-blue-500/30',
    amber: 'from-amber-400/30 to-orange-400/30 hover:shadow-amber-500/30',
    green: 'from-green-400/30 to-emerald-400/30 hover:shadow-green-500/30',
  };

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1, y: -4 }}
      whileTap={{ scale: 0.95 }}
      className={`group relative flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-white/30 to-white/15 shadow-2xl ring-1 ring-white/30 backdrop-blur-sm transition-all duration-300 focus:ring-2 focus:ring-white/50 focus:outline-none sm:h-16 sm:w-16 sm:rounded-2xl ${colorMap[hoverColor]?.split(' ').pop() ?? ''}`}
      aria-label={label}
      type="button"
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${colorMap[hoverColor]?.split(' ').slice(0, 2).join(' ') ?? ''} opacity-0 transition-opacity group-hover:opacity-100`}
      />
      <Icon
        size={24}
        className="relative z-10 text-white drop-shadow-lg transition-transform group-hover:scale-110 sm:h-7 sm:w-7"
      />
    </motion.button>
  );
}

function LoadingSpinner({ message, subMessage }: { message: string; subMessage: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex flex-col items-center justify-center gap-5"
    >
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-purple-400/30 blur-xl" />
        <svg
          className="relative h-14 w-14 animate-spin text-white/90 drop-shadow-xl"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="absolute inset-2 animate-pulse rounded-full bg-linear-to-tr from-purple-400/20 to-blue-400/20 blur-md" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <motion.p
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="font-bold text-white/90 drop-shadow-sm"
        >
          {message}
        </motion.p>
        <p className="text-xs text-white/50">{subMessage}</p>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Custom Hooks
// ============================================================================

function useEditorOperations(editor: Editor) {
  const abortRef = useRef<AbortController | null>(null);

  const getSelectedText = useCallback(() => {
    const { selection } = editor.state;
    return editor.state.doc.textBetween(selection.from, selection.to);
  }, [editor]);

  const getSelectedBlockText = useCallback(() => {
    const { $from } = editor.state.selection;
    const start = $from.start($from.depth);
    const end = $from.end($from.depth);
    return editor.state.doc.textBetween(start, end, '\n', '\n');
  }, [editor]);

  const getEntireText = useCallback(() => {
    const { doc } = editor.state;
    return doc.textBetween(0, doc.content.size, '\n', '\n');
  }, [editor]);

  const typeText = useCallback(
    async (text: string, replaceSelection = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      if (replaceSelection) {
        editor.chain().focus().deleteSelection().run();
      }

      // Parse markdown to HTML and insert it properly
      const html = await marked.parse(text);

      // For typing effect with proper formatting, insert chunks of parsed content
      // Option A: Insert all at once (no typing effect, but proper formatting)
      editor.chain().focus().insertContent(html).run();
    },
    [editor],
  );

  const cancelTyping = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    getSelectedText,
    getSelectedBlockText,
    getEntireText,
    typeText,
    cancelTyping,
  };
}

function useStreamingChat(activityUuid: string, accessToken: string) {
  const dispatchAIEditor = useAIEditorDispatch();
  const aiEditorState = useAIEditor();

  const sendMessage = useCallback(
    async (message: string): Promise<string> => {
      dispatchAIEditor({ type: 'addMessage', payload: { sender: 'user', message } });
      dispatchAIEditor({ type: 'setIsWaitingForResponse' });
      dispatchAIEditor({ type: 'setChatInputValue', payload: '' });

      let streamingContent = '';

      const handleChunk = (chunk: { content?: string }) => {
        if (chunk.content) streamingContent += chunk.content;
      };

      const handleStatus = (status: { message?: string; aichat_uuid?: string }) => {
        if (status.aichat_uuid) {
          dispatchAIEditor({ type: 'setAichat_uuid', payload: status.aichat_uuid });
        }
      };

      const handleError = (error: { error?: string }) => {
        dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
        dispatchAIEditor({
          type: 'setError',
          payload: {
            isError: true,
            status: 500,
            error_message: error.error || 'Streaming failed',
          },
        });
        dispatchAIEditor({ type: 'setIsFeedbackModalOpen' });
      };

      return new Promise((resolve) => {
        const handleFinal = (final: { content?: string; aichat_uuid?: string }) => {
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          if (final.aichat_uuid) {
            dispatchAIEditor({ type: 'setAichat_uuid', payload: final.aichat_uuid });
          }
          const finalMessage = final.content || streamingContent;
          dispatchAIEditor({
            type: 'addMessage',
            payload: { sender: 'ai', message: finalMessage },
          });
          resolve(finalMessage);
        };

        const streamFn = aiEditorState.aichat_uuid
          ? () =>
              sendActivityAIChatMessageStream(
                message,
                aiEditorState.aichat_uuid!,
                activityUuid,
                accessToken,
                handleChunk,
                handleStatus,
                handleFinal,
                (e) => {
                  handleError(e);
                  resolve('');
                },
              )
          : () =>
              startActivityAIChatSessionStream(
                message,
                activityUuid,
                accessToken,
                handleChunk,
                handleStatus,
                handleFinal,
                (e) => {
                  handleError(e);
                  resolve('');
                },
              );

        streamFn().catch((error: unknown) => {
          handleError({ error: error instanceof Error ? error.message : 'Unknown error' });
          resolve('');
        });
      });
    },
    [activityUuid, accessToken, aiEditorState.aichat_uuid, dispatchAIEditor],
  );

  return { sendMessage };
}

// ============================================================================
// Tool Button Component
// ============================================================================

interface ToolButtonProps {
  label: ToolLabel;
}

function AiEditorToolButton({ label }: ToolButtonProps) {
  const dispatchAIEditor = useAIEditorDispatch();
  const aiEditorState = useAIEditor();
  const t = useTranslations('Activities.AIEditorToolkit');

  const handleClick = useCallback(() => {
    dispatchAIEditor({ type: 'setIsModalOpen' });
    dispatchAIEditor({ type: 'setIsUserInputEnabled', payload: label === 'Writer' });
    dispatchAIEditor({ type: 'setSelectedTool', payload: label });
    dispatchAIEditor({ type: 'setIsFeedbackModalOpen' });
  }, [dispatchAIEditor, label]);

  const isSelected = aiEditorState.selectedTool === label;
  const Icon = TOOL_ICONS[label];

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      className={`group relative flex items-center gap-1.5 overflow-hidden rounded-lg px-2.5 py-1.5 text-xs font-semibold backdrop-blur-xl transition-all duration-300 focus:ring-2 focus:ring-white/40 focus:outline-none sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm ${
        isSelected
          ? 'bg-white/25 text-white shadow-lg ring-1 ring-white/40'
          : 'bg-white/12 text-white/80 ring-1 ring-white/15 hover:bg-white/20 hover:text-white hover:ring-white/25'
      }`}
      aria-label={t(`${label}Label`)}
      type="button"
    >
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/30 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative z-10 transition-transform group-hover:scale-110 group-hover:rotate-6">
        <Icon
          size={14}
          className="drop-shadow-lg sm:h-4 sm:w-4"
        />
      </div>
      <span className="relative z-10 hidden drop-shadow-sm sm:inline">{t(`${label}Label`)}</span>
      {isSelected && (
        <motion.div
          layoutId="activeToolIndicator"
          className="absolute bottom-0 left-1/2 h-0.5 w-3/4 -translate-x-1/2 rounded-full bg-linear-to-r from-transparent via-white to-transparent"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
    </motion.button>
  );
}

// ============================================================================
// Action Screen Component
// ============================================================================

interface ActionScreenProps {
  onExecute: () => void;
}

function AiEditorActionScreen({ onExecute }: ActionScreenProps) {
  const dispatchAIEditor = useAIEditorDispatch();
  const aiEditorState = useAIEditor();
  const t = useTranslations('Activities.AIEditorToolkit');

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      dispatchAIEditor({ type: 'setChatInputValue', payload: e.target.value });
    },
    [dispatchAIEditor],
  );

  const handleDismissError = useCallback(() => {
    dispatchAIEditor({
      type: 'setError',
      payload: { isError: false, status: 0, error_message: '' },
    });
  }, [dispatchAIEditor]);

  const lastAiMessage = useMemo(
    () => [...aiEditorState.messages].toReversed().find((msg) => msg.sender === 'ai'),
    [aiEditorState.messages],
  );

  const hasAiResponse =
    lastAiMessage && !aiEditorState.isWaitingForResponse && aiEditorState.selectedTool === 'Critisize';

  if (aiEditorState.error.isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex h-auto items-center"
      >
        <div className="relative mx-auto flex w-full flex-col space-y-2 overflow-hidden rounded-xl border border-red-500/40 bg-red-500/20 p-4 shadow-xl backdrop-blur-xl sm:space-y-3 sm:rounded-2xl sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-red-400/20 to-transparent" />
          <div className="relative flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/30 ring-1 ring-red-500/40 sm:h-9 sm:w-9 sm:rounded-xl">
                <AlertTriangle
                  size={18}
                  className="text-red-200 sm:h-5 sm:w-5"
                />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-red-100 sm:text-base">{t('errorTitle')}</h3>
                <span className="text-xs leading-relaxed text-red-50/90 sm:text-sm">
                  {aiEditorState.error.error_message}
                </span>
              </div>
            </div>
            <motion.button
              onClick={handleDismissError}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/30 text-red-200 transition-colors hover:bg-red-500/40 hover:text-red-100 focus:ring-2 focus:ring-red-300/50 focus:outline-none sm:h-8 sm:w-8"
              aria-label={t('dismissError')}
              type="button"
            >
              <X
                size={14}
                className="sm:h-4 sm:w-4"
              />
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (aiEditorState.isWaitingForResponse) {
    return (
      <LoadingSpinner
        message={t('thinking')}
        subMessage={t('processingRequest')}
      />
    );
  }

  const { selectedTool } = aiEditorState;

  if (selectedTool === 'Writer') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center space-y-2 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-white/30 to-white/15 shadow-xl ring-1 ring-white/30 backdrop-blur-sm sm:h-14 sm:w-14 sm:rounded-2xl">
          <Feather
            size={24}
            className="text-white drop-shadow-lg sm:h-7 sm:w-7"
          />
        </div>
        <span className="text-base font-bold text-white drop-shadow-sm sm:text-lg">{t('writerPlaceholder')}</span>
        <span className="text-xs text-white/60">{t('typePromptBelow')}</span>
      </motion.div>
    );
  }

  if (selectedTool === 'ContinueWriting') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex flex-col items-center justify-center space-y-3 sm:space-y-4"
      >
        <p className="text-center text-sm font-semibold text-white drop-shadow-sm">{t('continuePlaceholder')}</p>
        <ActionButton
          onClick={onExecute}
          label={t('continuePlaceholder')}
          icon={FastForward}
          hoverColor="purple"
        />
      </motion.div>
    );
  }

  if (selectedTool === 'MakeLonger') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex flex-col items-center justify-center space-y-3 sm:space-y-4"
      >
        <p className="text-center text-sm font-semibold text-white drop-shadow-sm">{t('longerPlaceholder')}</p>
        <ActionButton
          onClick={onExecute}
          label={t('longerPlaceholder')}
          icon={FileStack}
          hoverColor="blue"
        />
      </motion.div>
    );
  }

  if (selectedTool === 'Critisize') {
    if (hasAiResponse) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto flex w-full flex-col items-center justify-center space-y-3"
        >
          <ScrollArea className="h-32 w-full rounded-xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm sm:h-[140px]">
            <div className="p-3 text-sm leading-relaxed whitespace-pre-wrap text-white sm:p-4">
              {lastAiMessage.message}
            </div>
          </ScrollArea>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex w-full flex-col items-center justify-center space-y-3"
      >
        <p className="text-center text-sm font-semibold text-white drop-shadow-sm">{t('critisizePlaceholder')}</p>
        <div className="flex flex-col items-center space-y-2 sm:space-y-3">
          <span className="text-xs font-medium text-white/70">{t('critisizeScopeLabel')}</span>
          <div className="flex gap-2">
            {(['selection', 'lecture'] as const).map((scope) => (
              <motion.button
                key={scope}
                type="button"
                onClick={() => dispatchAIEditor({ type: 'setCritisizeScope', payload: scope })}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`relative overflow-hidden rounded-lg px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-all duration-300 focus:ring-2 focus:ring-white/40 focus:outline-none sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm ${
                  aiEditorState.critisizeScope === scope
                    ? 'bg-white/30 text-white shadow-lg ring-1 ring-white/40'
                    : 'bg-white/10 text-white/70 ring-1 ring-white/15 hover:bg-white/20 hover:text-white'
                }`}
                aria-pressed={aiEditorState.critisizeScope === scope}
              >
                {aiEditorState.critisizeScope === scope && (
                  <motion.div
                    layoutId="critisizeScope"
                    className="absolute inset-0 bg-linear-to-br from-white/20 to-transparent"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">
                  {t(scope === 'selection' ? 'critisizeScopeSelection' : 'critisizeScopeLecture')}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
        <ActionButton
          onClick={onExecute}
          label={t('critisizePlaceholder')}
          icon={Lightbulb}
          hoverColor="amber"
        />
      </motion.div>
    );
  }

  if (selectedTool === 'Translate') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex w-full flex-col items-center justify-center space-y-3 sm:space-y-4"
      >
        <div className="flex w-full flex-col items-center gap-2 sm:gap-3">
          <p className="text-center text-sm font-semibold text-white drop-shadow-sm">{t('translatePlaceholder')}</p>
          <input
            value={aiEditorState.chatInputValue}
            onChange={handleInputChange}
            placeholder={t('translateExample')}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-inner backdrop-blur-sm transition-all placeholder:text-white/50 hover:border-white/30 hover:bg-white/15 focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/30 focus:outline-none sm:rounded-xl sm:px-4 sm:py-2.5"
          />
        </div>
        <ActionButton
          onClick={onExecute}
          label={t('translatePlaceholder')}
          icon={Languages}
          hoverColor="green"
        />
      </motion.div>
    );
  }

  return null;
}

// ============================================================================
// Feedback Modal Component
// ============================================================================

function UserFeedbackModal({ editor, activity }: AIEditorToolkitProps) {
  const dispatchAIEditor = useAIEditorDispatch();
  const aiEditorState = useAIEditor();
  const session = usePlatformSession() as { data?: { tokens?: { access_token?: string } } };
  const accessToken = session?.data?.tokens?.access_token ?? '';
  const t = useTranslations('Activities.AIEditorToolkit');

  const { getSelectedText, getSelectedBlockText, getEntireText, typeText } = useEditorOperations(editor);
  const { sendMessage } = useStreamingChat(activity.activity_uuid, accessToken);

  const getPrompt = useCallback(
    ({ label, selection, scope, targetLanguage }: AIPromptsLabels): string => {
      if (!selection) return '';

      switch (label) {
        case 'Writer': {
          return t('prompt_writer', { selection });
        }
        case 'ContinueWriting': {
          return t('prompt_continueWriting', { selection });
        }
        case 'MakeLonger': {
          return t('prompt_makeLonger', { selection });
        }
        case 'Critisize': {
          return scope === 'lecture'
            ? t('prompt_critisizeLecture', { selection })
            : t('prompt_critisize', { selection });
        }
        case 'Translate': {
          return targetLanguage ? t('prompt_translateTo', { language: targetLanguage, selection }) : '';
        }
        default: {
          return '';
        }
      }
    },
    [t],
  );

  const handleOperation = useCallback(
    async (label: ToolLabel, inputValue: string) => {
      dispatchAIEditor({ type: 'setSelectedTool', payload: label });

      switch (label) {
        case 'Writer': {
          const prompt = getPrompt({ label, selection: inputValue });
          if (!prompt) return;

          dispatchAIEditor({ type: 'setIsUserInputEnabled', payload: false });
          dispatchAIEditor({ type: 'setIsWaitingForResponse' });
          const response = await sendMessage(prompt);
          await typeText(response);
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          dispatchAIEditor({ type: 'setIsUserInputEnabled', payload: true });
          break;
        }

        case 'ContinueWriting': {
          const selection = getSelectedBlockText();
          const prompt = getPrompt({ label, selection });
          if (!prompt) return;

          dispatchAIEditor({ type: 'setIsWaitingForResponse' });
          const response = await sendMessage(prompt);
          const cleanedResponse = removeSentences(selection, response);
          await typeText(cleanedResponse);
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          break;
        }

        case 'MakeLonger': {
          const selection = getSelectedText();
          const prompt = getPrompt({ label, selection });
          if (!prompt) return;

          dispatchAIEditor({ type: 'setIsWaitingForResponse' });
          const response = await sendMessage(prompt);
          await typeText(response, true);
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          break;
        }

        case 'Critisize': {
          const scope = aiEditorState.critisizeScope;
          const selection = scope === 'lecture' ? getEntireText() : getSelectedBlockText();

          if (!selection) {
            toast.error(scope === 'lecture' ? t('critisizeLectureMissing') : t('critisizeSelectionMissing'));
            return;
          }

          const prompt = getPrompt({ label, selection, scope });
          if (!prompt) return;

          dispatchAIEditor({ type: 'setIsWaitingForResponse' });
          await sendMessage(prompt);
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          break;
        }

        case 'Translate': {
          const selection = getSelectedText();
          if (!selection || !inputValue) {
            toast.error(t('translateToLanguageMissing'));
            return;
          }

          const prompt = getPrompt({ label, selection, targetLanguage: inputValue });
          if (!prompt) return;

          dispatchAIEditor({ type: 'setIsWaitingForResponse' });
          const response = await sendMessage(prompt);
          if (response) await typeText(response, true);
          dispatchAIEditor({ type: 'setIsNoLongerWaitingForResponse' });
          break;
        }
      }
    },
    [
      dispatchAIEditor,
      getPrompt,
      sendMessage,
      typeText,
      getSelectedText,
      getSelectedBlockText,
      getEntireText,
      aiEditorState.critisizeScope,
      t,
    ],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      dispatchAIEditor({ type: 'setChatInputValue', payload: e.target.value });
    },
    [dispatchAIEditor],
  );

  const handleKeyPress = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleOperation(aiEditorState.selectedTool, aiEditorState.chatInputValue);
      }
    },
    [handleOperation, aiEditorState.selectedTool, aiEditorState.chatInputValue],
  );

  const handleSubmit = useCallback(() => {
    handleOperation(aiEditorState.selectedTool, aiEditorState.chatInputValue);
  }, [handleOperation, aiEditorState.selectedTool, aiEditorState.chatInputValue]);

  return (
    <motion.div
      variants={FEEDBACK_MODAL_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={SPRING_TRANSITION_SLOW}
      className="fixed top-0 left-0 z-60 flex h-full w-full items-center justify-center"
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{ pointerEvents: 'auto', background: FEEDBACK_GLASS_BACKGROUND }}
        className="fixed bottom-24 left-1/2 z-50 mx-auto min-h-[200px] w-[calc(100vw-2rem)] max-w-[660px] -translate-x-1/2 flex-col rounded-2xl border border-white/25 p-4 text-white shadow-2xl shadow-black/60 sm:bottom-[120px] sm:min-h-[240px] sm:rounded-3xl sm:p-5"
      >
        {/* Glass reflections */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl sm:rounded-3xl">
          <div className="absolute inset-0 bg-linear-to-br from-white/30 via-white/10 to-transparent opacity-80" />
          <div className="absolute top-0 left-0 h-24 w-24 bg-white/15 blur-3xl sm:h-32 sm:w-32" />
          <div className="absolute right-0 bottom-0 h-20 w-20 bg-purple-400/20 blur-2xl sm:h-24 sm:w-24" />
        </div>

        <div className="relative flex flex-col space-y-3 sm:space-y-4">
          {/* Header */}
          <div className="flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-white/30 to-white/15 shadow-xl ring-1 ring-white/25 backdrop-blur-sm sm:h-12 sm:w-12 sm:rounded-2xl">
              <Image
                width={24}
                height={24}
                src={platformLogoLight}
                alt={t('platformLogoAlt')}
                className="drop-shadow-2xl sm:h-7 sm:w-7"
              />
            </div>
          </div>

          {/* Content */}
          <div className="mx-auto flex min-h-[100px] w-full items-center justify-center rounded-xl bg-black/20 p-3 backdrop-blur-sm sm:min-h-[120px] sm:rounded-2xl sm:p-4">
            <AiEditorActionScreen onExecute={handleSubmit} />
          </div>

          {/* Input */}
          {aiEditorState.isUserInputEnabled && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  onKeyDown={handleKeyPress}
                  value={aiEditorState.chatInputValue}
                  onChange={handleInputChange}
                  placeholder={t('askAI')}
                  disabled={aiEditorState.isWaitingForResponse}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white shadow-inner backdrop-blur-xl transition-all placeholder:text-white/50 hover:border-white/30 hover:bg-white/15 focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-xl sm:px-4 sm:py-3"
                  aria-label={t('askAI')}
                />
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-linear-to-r from-white/10 to-transparent sm:rounded-xl" />
              </div>
              <IconButton
                onClick={handleSubmit}
                label={t('sendMessage')}
                disabled={aiEditorState.isWaitingForResponse || !aiEditorState.chatInputValue.trim()}
              >
                <BetweenHorizontalStart
                  size={18}
                  className="relative z-10 text-white/90 transition-colors group-hover:text-white sm:h-5 sm:w-5"
                />
              </IconButton>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AIEditorToolkit({ editor, activity }: AIEditorToolkitProps) {
  const dispatchAIEditor = useAIEditorDispatch();
  const aiEditorState = useAIEditor();
  const t = useTranslations('Activities.AIEditorToolkit');

  const handleClose = useCallback(() => {
    dispatchAIEditor({ type: 'setIsModalClose' });
    dispatchAIEditor({ type: 'setIsFeedbackModalClose' });
  }, [dispatchAIEditor]);

  return (
    <div className="flex space-x-2">
      <AnimatePresence>
        {aiEditorState.isModalOpen && (
          <motion.div
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={SPRING_TRANSITION}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ pointerEvents: 'none' }}
          >
            {aiEditorState.isFeedbackModalOpen && (
              <UserFeedbackModal
                activity={activity}
                editor={editor}
              />
            )}

            {/* Toolkit Sheet */}
            <div
              style={{ pointerEvents: 'auto', background: GLASS_BACKGROUND }}
              className="fixed bottom-0 left-1/2 z-40 mx-auto mb-6 w-242 max-w-screen -translate-x-1/2 flex-col-reverse rounded-2xl border border-white/20 p-3 text-white shadow-2xl shadow-black/50 sm:mb-10 sm:rounded-3xl sm:p-4 md:max-w-(--breakpoint-3xl)"
            >
              <GlassOverlay />

              <div className="relative flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Logo & Title */}
                <div className="flex items-center gap-2 pr-2 sm:gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 shadow-lg backdrop-blur-sm sm:h-10 sm:w-10">
                    <Image
                      width={20}
                      height={20}
                      src={platformLogoLight}
                      alt={t('aiIconAlt')}
                      className="drop-shadow-lg"
                    />
                  </div>
                  <div className="hidden flex-col sm:flex">
                    <span className="text-sm font-bold text-white">{t('aiEditorTitle')}</span>
                  </div>
                </div>

                <VerticalDivider />

                {/* Tools */}
                <div className="tools flex min-w-0 flex-1 flex-wrap gap-1.5 sm:gap-2">
                  <AiEditorToolButton label="Writer" />
                  <AiEditorToolButton label="ContinueWriting" />
                  <AiEditorToolButton label="MakeLonger" />
                  <AiEditorToolButton label="Critisize" />
                  <AiEditorToolButton label="Translate" />
                </div>

                {/* Close Button */}
                <div className="ml-auto flex items-center">
                  <IconButton
                    onClick={handleClose}
                    label={t('closeToolkit')}
                    variant="danger"
                  >
                    <X
                      className="relative z-10 transition-transform group-hover:rotate-90"
                      size={20}
                    />
                  </IconButton>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
