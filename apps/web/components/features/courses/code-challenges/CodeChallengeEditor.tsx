'use client';

import { History, Loader2, Play, Send, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getAPIUrl } from '@services/config/config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import { SubmissionStatusBadge } from './SubmissionStatusBadge';
import { LanguageSelector } from './LanguageSelector';
import type { TestCaseResult } from './TestCaseCard';
import { TestResultsList } from './TestCaseCard';
import { CodeEditor } from './CodeEditor';
import { JUDGE0_LANGUAGES } from '.';

interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
}

interface CodeChallengeSettings {
  uuid?: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  time_limit: number;
  memory_limit: number;
  max_submissions?: number;
  grading_strategy: string;
  allowed_languages: number[];
  visible_tests: TestCase[];
  hidden_tests?: TestCase[];
  starter_code?: Record<string, string>;
  solution_code?: Record<string, string>;
}

interface Submission {
  uuid: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error';
  score?: number;
  max_score: number;
  language_id: number;
  created_at: string;
  results?: TestCaseResult[];
}

interface CodeChallengeEditorProps {
  activityUuid: string;
  challengeTitle?: string;
  challengeDescription?: string;
  settings?: CodeChallengeSettings;
  initialCode?: string;
  initialLanguageId?: number;
  onSubmissionComplete?: (submission: Submission) => void;
}

const fetcher = async ([url, token]: [string, string]) => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export function CodeChallengeEditor({
  activityUuid,
  challengeTitle,
  challengeDescription,
  settings,
  initialCode = '',
  initialLanguageId,
  onSubmissionComplete,
}: CodeChallengeEditorProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const session = usePlatformSession();
  const accessToken = session?.data?.tokens?.access_token;

  // State
  const [code, setCode] = useState(initialCode);
  const [selectedLanguageId, setSelectedLanguageId] = useState<number>(
    initialLanguageId ?? settings?.allowed_languages?.[0] ?? 71, // Default to Python
  );
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('testcases');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch submissions history
  const { data: submissions, mutate: refreshSubmissions } = useSWR<Submission[]>(
    accessToken ? [`${getAPIUrl()}code-challenges/${activityUuid}/submissions`, accessToken] : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Poll for active submission status
  const { data: activeSubmission } = useSWR<Submission>(
    activeSubmissionId && accessToken
      ? [`${getAPIUrl()}code-challenges/submissions/${activeSubmissionId}`, accessToken]
      : null,
    fetcher,
    {
      refreshInterval: activeSubmissionId ? 1000 : 0,
      revalidateOnFocus: false,
    },
  );

  // Handle submission completion
  useEffect(() => {
    if (activeSubmission?.status === 'completed' || activeSubmission?.status === 'failed') {
      setActiveSubmissionId(null);
      setIsSubmitting(false);
      setTestResults(activeSubmission.results || null);
      setActiveTab('results');
      refreshSubmissions();
      onSubmissionComplete?.(activeSubmission);

      if (activeSubmission.status === 'completed' && activeSubmission.score === activeSubmission.max_score) {
        toast.success(t('allTestsPassed'));
      } else if (activeSubmission.status === 'failed') {
        toast.error(t('submissionFailed'));
      }
    }
  }, [activeSubmission, refreshSubmissions, onSubmissionComplete, t]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      const id = pollIntervalRef.current;
      if (id) {
        clearInterval(id);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Set initial code from starter template
  useEffect(() => {
    if (settings?.starter_code && !code) {
      const starterCode = settings.starter_code[selectedLanguageId.toString()];
      if (starterCode) {
        setCode(starterCode);
      }
    }
  }, [settings, selectedLanguageId, code]);

  // Run custom test
  const handleRunTest = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'));
      return;
    }
    if (!accessToken) {
      toast.error(t('authRequired'));
      return;
    }

    setIsRunning(true);
    setCustomOutput('');
    setActiveTab('custom');

    try {
      const res = await fetch(`${getAPIUrl()}code-challenges/${activityUuid}/custom-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          source_code: btoa(code),
          language_id: selectedLanguageId,
          stdin: btoa(customInput),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Run failed');
      }

      const result = await res.json();
      setCustomOutput(result.compile_output || result.stderr || result.stdout || t('noOutput'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('runFailed'));
      setCustomOutput(error instanceof Error ? error.message : t('runFailed'));
    } finally {
      setIsRunning(false);
    }
  }, [code, selectedLanguageId, customInput, activityUuid, t, accessToken]);

  // Run against sample test cases
  const handleTestAgainstSamples = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'));
      return;
    }
    if (!accessToken) {
      toast.error(t('authRequired'));
      return;
    }

    setIsRunning(true);
    setTestResults(null);
    setActiveTab('results');

    try {
      const res = await fetch(`${getAPIUrl()}code-challenges/${activityUuid}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          source_code: btoa(code),
          language_id: selectedLanguageId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Test failed');
      }

      const result = await res.json();
      setTestResults(result.results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('testFailed'));
    } finally {
      setIsRunning(false);
    }
  }, [code, selectedLanguageId, activityUuid, t, accessToken]);

  // Submit solution
  const handleSubmit = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToSubmit'));
      return;
    }
    if (!accessToken) {
      toast.error(t('authRequired'));
      return;
    }

    setIsSubmitting(true);
    setTestResults(null);

    try {
      const res = await fetch(`${getAPIUrl()}code-challenges/${activityUuid}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          source_code: btoa(code),
          language_id: selectedLanguageId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Submission failed');
      }

      const submission = await res.json();
      setActiveSubmissionId(submission.submission_uuid);
      toast.info(t('submissionQueued'));
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : t('submissionFailed'));
    }
  }, [code, selectedLanguageId, activityUuid, t, accessToken]);

  // Get language name from ID
  const getLanguageName = (languageId: number): string => {
    const lang = JUDGE0_LANGUAGES.find((l) => l.id === languageId);
    return lang?.name ?? `Language ${languageId}`;
  };

  // Get visible test cases - use visible_tests from settings
  const visibleTestCases = settings?.visible_tests ?? [];
  const visibleTestIds = new Set(visibleTestCases.map((tc: TestCase) => tc.id));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div>
          {challengeTitle && <h2 className="text-xl font-semibold">{challengeTitle}</h2>}
          {challengeDescription && <p className="text-muted-foreground mt-1 text-sm">{challengeDescription}</p>}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector
            languages={JUDGE0_LANGUAGES}
            selectedId={selectedLanguageId}
            onSelect={setSelectedLanguageId}
            allowedLanguages={settings?.allowed_languages}
          />
        </div>
      </div>

      {/* Main Content */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1"
      >
        {/* Editor Panel */}
        <ResizablePanel
          defaultSize={60}
          minSize={30}
        >
          <div className="flex h-full flex-col">
            <CodeEditor
              value={code}
              onChange={setCode}
              languageId={selectedLanguageId}
              className="flex-1"
            />

            {/* Editor Actions */}
            <div className="bg-muted/50 flex items-center justify-between border-t p-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunTest}
                  disabled={isRunning || isSubmitting}
                >
                  {isRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Terminal className="mr-2 h-4 w-4" />
                  )}
                  {t('runCode')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestAgainstSamples}
                  disabled={isRunning || isSubmitting || visibleTestCases.length === 0}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {t('runTests')}
                </Button>
              </div>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isRunning || isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {t('submit')}
              </Button>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Results Panel */}
        <ResizablePanel
          defaultSize={40}
          minSize={25}
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex h-full flex-col"
          >
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="testcases"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('testCases')}
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('customInput')}
              </TabsTrigger>
              <TabsTrigger
                value="results"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('results')}
                {testResults && (
                  <Badge
                    variant="secondary"
                    className="ml-2"
                  >
                    {testResults.filter((r) => r.passed).length}/{testResults.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                <History className="mr-1 h-4 w-4" />
                {t('history')}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="testcases"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                <div className="space-y-4 p-1">
                  {visibleTestCases.length === 0 ? (
                    <p className="text-muted-foreground text-center">{t('noVisibleTestCases')}</p>
                  ) : (
                    visibleTestCases.map((tc, index) => (
                      <Card key={`${tc.id ?? 'tc'}-${index}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            {t('testCase')} #{index + 1}
                            {tc.description && ` - ${tc.description}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <div className="text-muted-foreground text-xs font-medium">{t('input')}:</div>
                            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-sm">
                              {tc.input || t('noInput')}
                            </pre>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs font-medium">{t('expectedOutput')}:</div>
                            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-sm">
                              {tc.expected_output}
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="custom"
              className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
            >
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">{t('customInput')}</label>
                <Textarea
                  placeholder={t('enterCustomInput')}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="h-32 resize-none font-mono text-sm"
                />
              </div>
              <Separator />
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">{t('output')}</label>
                <ScrollArea className="bg-muted h-32 rounded border p-2">
                  <pre className="font-mono text-sm whitespace-pre-wrap">{customOutput || t('noOutput')}</pre>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent
              value="results"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                {isSubmitting && activeSubmission?.status === 'processing' ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="text-primary h-8 w-8 animate-spin" />
                    <p className="text-muted-foreground mt-4">{t('runningTests')}</p>
                  </div>
                ) : testResults ? (
                  <TestResultsList
                    results={testResults}
                    visibleTestIds={visibleTestIds}
                    testCases={visibleTestCases}
                  />
                ) : (
                  <p className="text-muted-foreground text-center">{t('noResultsYet')}</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="history"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {!submissions?.length ? (
                    <p className="text-muted-foreground text-center">{t('noSubmissionsYet')}</p>
                  ) : (
                    submissions.map((submission, index) => (
                      <Card
                        key={`${submission.uuid ?? 'submission'}-${index}`}
                        className="p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <SubmissionStatusBadge
                                status={submission.status}
                                score={submission.score}
                                maxScore={submission.max_score}
                              />
                              <Badge variant="outline">{getLanguageName(submission.language_id)}</Badge>
                            </div>
                            <p className="text-muted-foreground text-xs">
                              {new Date(submission.created_at).toLocaleString()}
                            </p>
                          </div>
                          {submission.score !== undefined && (
                            <div className="text-right">
                              <div className="text-lg font-semibold">
                                {submission.score}/{submission.max_score}
                              </div>
                              <div className="text-muted-foreground text-xs">{t('pointsShort')}</div>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default CodeChallengeEditor;
