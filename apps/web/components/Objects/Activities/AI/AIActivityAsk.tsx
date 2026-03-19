'use client';

import { useAIChatBot, useAIChatBotDispatch } from '@components/Contexts/AI/AIChatBotContext';
import { AlertTriangle, BadgeInfo, MessageCircle, NotebookTabs, X } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';

// for typing the session prop without exporting internal types
export type PlatformSession = ReturnType<typeof usePlatformSession>;
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import platformLogoLight from '@public/platform_logo_light.svg';
import { useActivityChat } from '@/hooks/useActivityChat';
import UserAvatar from '@components/Objects/UserAvatar';
import { ScrollArea } from '@components/ui/scroll-area';
import { Card, CardContent } from '@components/ui/card';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

import type { AIMessage } from '@components/Contexts/AI/AIBaseContext';

// Type definitions
interface Activity {
  activity_uuid: string;
  [key: string]: any;
}

interface AIActivityAskProps {
  activity: Activity;
}

interface ErrorState {
  isError: boolean;
  status?: number;
  error_message?: string;
}

type PredefinedQuestionType = 'about' | 'flashcards' | 'examples';

// Main Component
const AIActivityAsk = ({ activity }: AIActivityAskProps) => {
  const t = useTranslations('Activities.AIActivityAsk');
  const dispatchAIChatBot = useAIChatBotDispatch();
  const aiChatBotState = useAIChatBot();

  const handleToggleModal = () => {
    dispatchAIChatBot({
      type: aiChatBotState.isModalOpen ? 'setIsModalClose' : 'setIsModalOpen',
    });
  };

  const handleKeyDown = (e: any) => {
    const key = e?.key ?? e?.nativeEvent?.key;
    if (key === 'Enter' || key === ' ') {
      e?.preventDefault?.();
      handleToggleModal();
    }
  };

  return (
    <>
      <ActivityChatMessageBox activity={activity} />
      <Button
        variant="ghost"
        size="sm"
        role="button"
        tabIndex={0}
        aria-pressed={aiChatBotState.isModalOpen}
        onKeyDown={handleKeyDown}
        onClick={handleToggleModal}
        style={{
          background:
            'linear-gradient(135deg, oklch(0.25 0.15 270) 0%, oklch(0.40 0.18 260) 50%, oklch(0.32 0.16 255) 100%)',
        }}
        className={cn(
          'h-10 flex items-center space-x-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white hover:text-white shadow-lg ring-1 ring-white/10 transition-all duration-200 hover:scale-105 hover:shadow-xl hover:ring-white/20 focus:ring-2 focus:ring-white/30 focus:outline-none active:scale-95',
          { 'ring-2 ring-white/30 shadow-xl': aiChatBotState.isModalOpen },
        )}
      >
        <Image
          className="rounded-md"
          width={20}
          height={20}
          src={platformLogoLight}
          alt={t('askAI')}
        />
        <span className="text-xs font-bold">{t('askAI')}</span>
      </Button>
    </>
  );
};

// Chat Message Box Component
interface ActivityChatMessageBoxProps {
  activity: Activity;
}

const ActivityChatMessageBox = ({ activity }: ActivityChatMessageBoxProps) => {
  const t = useTranslations('Activities.AIActivityAsk');
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const aiChatBotState = useAIChatBot();
  const dispatchAIChatBot = useAIChatBotDispatch();

  const scrollYRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // All streaming + send logic is encapsulated in useActivityChat.
  // `localStreamingDisplay: true` keeps live token updates in component-local
  // state so only THIS component re-renders during streaming, not every
  // consumer of AIChatBotContext.
  const { sendMessage, localStreamingText, statusMessage, cleanup } = useActivityChat({
    activityUuid: activity.activity_uuid,
    accessToken: access_token,
    chatUuid: aiChatBotState.aichat_uuid,
    dispatch: dispatchAIChatBot as any,
    localStreamingDisplay: true,
  });

  // Show local streaming text when this component triggered the stream;
  // fall back to context's streamingMessage when AICanvaToolkit did.
  const activeStreamingText = localStreamingText || aiChatBotState.streamingMessage;
  const activeStatusMessage = statusMessage || aiChatBotState.statusMessage;

  // Lock scroll on mobile when modal is open
  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return;

    const isSmallViewport = globalThis.matchMedia('(max-width: 767px)').matches;

    if (aiChatBotState.isModalOpen && isSmallViewport) {
      scrollYRef.current = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';

      if (!aiChatBotState.isModalOpen && isSmallViewport) {
        window.scrollTo(0, scrollYRef.current || 0);
      }
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (isSmallViewport) window.scrollTo(0, scrollYRef.current || 0);
    };
  }, [aiChatBotState.isModalOpen]);

  // Auto-scroll: instant during streaming (avoids repeated layout animation),
  // smooth scroll when a new committed message arrives.
  useEffect(() => {
    if (activeStreamingText) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }
  }, [activeStreamingText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChatBotState.messages]);

  // Abort stream on unmount.
  useEffect(() => cleanup, [cleanup]);

  // Abort and clear when the modal closes.
  useEffect(() => {
    if (!aiChatBotState.isModalOpen) {
      cleanup();
      dispatchAIChatBot({ type: 'clearStreamingMessage' });
      dispatchAIChatBot({ type: 'setStatusMessage', payload: null });
      // Always clear waiting state so the input is not stuck as disabled.
      dispatchAIChatBot({ type: 'setIsNoLongerWaitingForResponse' });
    }
  }, [aiChatBotState.isModalOpen, cleanup, dispatchAIChatBot]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !aiChatBotState.isWaitingForResponse) {
      sendMessage(event.currentTarget.value);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    dispatchAIChatBot({
      type: 'setChatInputValue',
      payload: event.currentTarget.value,
    });
  };

  const closeModal = () => {
    dispatchAIChatBot({ type: 'setIsModalClose' });
  };

  if (!aiChatBotState.isModalOpen) {
    return null;
  }

  const hasMessages = aiChatBotState.messages.length > 0;
  const isDisabled = aiChatBotState.isWaitingForResponse;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0.3, filter: 'blur(5px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        exit={{ y: 50, opacity: 0, filter: 'blur(25px)' }}
        transition={{
          type: 'spring',
          bounce: 0.35,
          duration: 1.7,
          mass: 0.2,
          velocity: 2,
        }}
        className="fixed bottom-4 left-1/2 z-50 w-[95%] max-w-4xl -translate-x-1/2"
        style={{ pointerEvents: 'auto' }}
      >
        <Card className="relative h-[300px] overflow-hidden border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0 shadow-2xl ring-1 ring-white/10">
          <CardContent className="flex h-full flex-col p-4">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className={cn('flex items-center gap-2', aiChatBotState.isWaitingForResponse && 'animate-pulse')}>
                <Image
                  className="rounded-lg"
                  width={28}
                  height={28}
                  src={platformLogoLight}
                  alt={t('AI')}
                />
                <span className="text-sm font-bold text-white">{t('AI')}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeModal}
                className="h-8 w-8 rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Status Message */}
            {activeStatusMessage && <p className="mb-2 text-xs text-white/60">{activeStatusMessage}</p>}

            {/* Messages Area */}
            <div className="mb-3 flex-1 overflow-hidden">
              {hasMessages && !aiChatBotState.error.isError ? (
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-4">
                    {aiChatBotState.messages.map((message: AIMessage, index: number) => (
                      <AIMessageComponent
                        key={`${message.sender}-${index}`}
                        message={message}
                        animated={message.sender === 'ai'}
                      />
                    ))}
                    {activeStreamingText && (
                      <AIMessageComponent
                        message={{
                          sender: 'ai',
                          message: activeStreamingText,
                        }}
                        animated
                      />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              ) : aiChatBotState.error.isError ? (
                <ErrorDisplay
                  error={aiChatBotState.error}
                  t={t}
                />
              ) : (
                <AIMessagePlaceHolder
                  sendMessage={sendMessage}
                  activity={activity}
                  session={session}
                />
              )}
            </div>

            {/* Input Area */}
            <div className="flex items-center gap-2">
              <UserAvatar
                size="sm"
                variant="outline"
              />
              <Input
                onKeyDown={handleKeyDown}
                onChange={handleChange}
                disabled={isDisabled}
                value={aiChatBotState.chatInputValue}
                placeholder={t('placeholder')}
                className={cn(
                  'flex-1 border-white/10 bg-slate-950/40 text-white placeholder:text-white/30',
                  isDisabled && 'opacity-30',
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => sendMessage(aiChatBotState.chatInputValue)}
                disabled={isDisabled || !aiChatBotState.chatInputValue.trim()}
                className="text-white/50 hover:text-white disabled:opacity-30"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};

// AI Message Component
interface AIMessageComponentProps {
  message: AIMessage;
  animated: boolean;
}

const AIMessageComponent = ({ message, animated }: AIMessageComponentProps) => {
  return (
    <div className="flex gap-2">
      <UserAvatar
        size="sm"
        variant="outline"
        predefined_avatar={message.sender === 'ai' ? 'ai' : undefined}
      />
      <motion.div
        initial={animated ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={animated ? { duration: 0.25 } : undefined}
        className="flex-1 rounded-lg bg-white/5 px-3 py-2"
      >
        <p className="text-sm leading-relaxed text-white whitespace-pre-wrap">{message.message}</p>
      </motion.div>
    </div>
  );
};

// Error Display Component
interface ErrorDisplayProps {
  error: ErrorState;
  t: (key: string) => string;
}

const ErrorDisplay = ({ error, t }: ErrorDisplayProps) => (
  <div className="flex h-full items-center justify-center">
    <Alert
      variant="destructive"
      className="max-w-md"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('errorTitle')}</AlertTitle>
      <AlertDescription>{error.error_message}</AlertDescription>
    </Alert>
  </div>
);

// Placeholder Component
interface AIMessagePlaceHolderProps {
  activity: Activity;
  sendMessage: (message: string) => void;
  // use ReturnType of hook for accurate session shape
  session: PlatformSession | null;
}

const AIMessagePlaceHolder = ({ sendMessage, session }: AIMessagePlaceHolderProps) => {
  const t = useTranslations('Activities.AIActivityAsk');

  const userName = session?.data?.user?.first_name || session?.data?.user?.username || 'Пользователь';

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-6">
      <motion.div
        initial={{ y: 20, opacity: 0, filter: 'blur(5px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{
          type: 'spring',
          bounce: 0.35,
          duration: 1.7,
          delay: 0.17,
        }}
        className="text-center"
      >
        <p className="flex flex-wrap items-center justify-center gap-2 text-xl font-semibold text-white/70">
          <span>{t('hello')}</span>
          <span className="flex items-center gap-2 capitalize">
            <UserAvatar
              size="sm"
              variant="outline"
            />
            <span>{userName},</span>
          </span>
          <span>{t('howCanWeHelp')}</span>
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0, filter: 'blur(5px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{
          type: 'spring',
          bounce: 0.35,
          duration: 1.7,
          delay: 0.27,
        }}
        className="flex flex-wrap justify-center gap-2"
      >
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="about"
        />
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="flashcards"
        />
        <AIChatPredefinedQuestion
          sendMessage={sendMessage}
          label="examples"
        />
      </motion.div>
    </div>
  );
};

// Predefined Question Component
interface AIChatPredefinedQuestionProps {
  sendMessage: (message: string) => void;
  label: PredefinedQuestionType;
}

const AIChatPredefinedQuestion = ({ sendMessage, label }: AIChatPredefinedQuestionProps) => {
  const t = useTranslations('Activities.AIActivityAsk');

  const getQuestion = (questionLabel: PredefinedQuestionType): string => {
    const questions = {
      about: t('questionAbout'),
      flashcards: t('questionFlashcards'),
      examples: t('questionExamples'),
    };
    return questions[questionLabel] || '';
  };

  const getIcon = (iconLabel: PredefinedQuestionType) => {
    const icons = {
      about: <BadgeInfo className="h-4 w-4" />,
      flashcards: <NotebookTabs className="h-4 w-4" />,
      examples: <span className="text-xs font-bold">{t('examplesAbbr')}</span>,
    };
    return icons[iconLabel];
  };

  const question = getQuestion(label);

  return (
    <Badge
      variant="outline"
      className="cursor-pointer gap-2 border-white/10 bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white/70"
      onClick={() => sendMessage(question)}
    >
      {getIcon(label)}
      <span className="text-xs">{question}</span>
    </Badge>
  );
};

export default AIActivityAsk;
