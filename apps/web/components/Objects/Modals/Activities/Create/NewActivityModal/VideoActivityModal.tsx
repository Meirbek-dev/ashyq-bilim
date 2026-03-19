'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileVideo,
  Info,
  Languages,
  Loader2,
  Play,
  Plus,
  Settings,
  Trash2,
  Upload,
  UploadCloud,
  VolumeX,
  Youtube,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ChangeEvent, ComponentType, DragEvent } from 'react';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { constructAcceptValue } from '@/lib/constants';
import { AnimatePresence, motion } from 'motion/react';
import { Separator } from '@components/ui/separator';
import { Checkbox } from '@components/ui/checkbox';
import { useEffect, useId, useState } from 'react';
import { Button } from '@components/ui/button';
import { cn, generateUUID } from '@/lib/utils';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const SUPPORTED_VIDEO_FILES = constructAcceptValue(['mp4', 'mkv', 'webm']);
const SUPPORTED_SUBTITLE_FILES = constructAcceptValue(['srt', 'vtt']);

interface SubtitleFile {
  id: string;
  file: File;
  language: string;
  label: string;
}

interface VideoDetails {
  startTime: number;
  endTime: number | null;
  autoplay: boolean;
  muted: boolean;
  subtitles?: SubtitleFile[];
}

interface ExternalVideoObject {
  name: string;
  type: string;
  uri: string;
  chapter_id: number;
  details: VideoDetails;
}

const getLocalizedLanguageOptions = (t: any) => [
  { code: 'en', label: t('languageEnglish'), flag: '🇺🇸' },
  { code: 'ru', label: t('languageRussian'), flag: '🇷🇺' },
  { code: 'kz', label: t('languageKazakh'), flag: '🇰🇿' },
  { code: 'fr', label: t('languageFrench'), flag: '🇫🇷' },
  { code: 'es', label: t('languageSpanish'), flag: '🇪🇸' },
  { code: 'de', label: t('languageGerman'), flag: '🇩🇪' },
];

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const TimeInput = ({
  label,
  icon: Icon,
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  placeholder,
  disabled = false,
  t,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  minutes: number;
  seconds: number;
  onMinutesChange: (minutes: number) => void;
  onSecondsChange: (seconds: number) => void;
  placeholder: string;
  disabled?: boolean;
  t: any;
}) => (
  <div className="space-y-3">
    <Label className="flex items-center gap-2 text-sm font-medium text-gray-900">
      <Icon
        size={16}
        className="text-blue-600"
      />
      {label}
    </Label>
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Input
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => onMinutesChange(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
          placeholder="0"
          className="text-center"
          disabled={disabled}
        />
        <span className="mt-1 block text-center text-xs font-medium text-gray-500">{t('minutes')}</span>
      </div>
      <div className="flex items-center text-xl font-bold text-gray-400">:</div>
      <div className="flex-1">
        <Input
          type="number"
          min="0"
          max="59"
          value={seconds}
          onChange={(e) => onSecondsChange(Math.max(0, Math.min(59, Number.parseInt(e.target.value, 10) || 0)))}
          placeholder="00"
          className="text-center"
          disabled={disabled}
        />
        <span className="mt-1 block text-center text-xs font-medium text-gray-500">{t('seconds')}</span>
      </div>
    </div>
    <div className="text-center">
      <Badge
        variant="outline"
        className="text-xs"
      >
        {formatTime(minutes * 60 + seconds)}
      </Badge>
    </div>
  </div>
);

const SubtitleManager = ({
  subtitles,
  setSubtitles,
  t,
}: {
  subtitles: SubtitleFile[];
  setSubtitles: (subtitles: SubtitleFile[]) => void;
  t: any;
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  function validateSubtitleFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    if (!(file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'))) {
      return { valid: false, error: t('errorSubtitleFileType') };
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { valid: false, error: t('errorSubtitleFileSize') };
    }

    // Check if language already exists
    const fileName = file.name.toLowerCase();
    const potentialLang = fileName.split('.').slice(-2, -1)[0];
    const existingLang = subtitles.find((s) => s.language === potentialLang || s.file.name.toLowerCase() === fileName);

    if (existingLang) {
      return { valid: false, error: t('errorSubtitleLanguageExists', { language: potentialLang }) };
    }

    return { valid: true };
  }

  async function addSubtitle(file: File, language: string, label: string) {
    const validation = validateSubtitleFile(file);
    if (!validation.valid) {
      toast.error(validation.error || t('errorInvalidSubtitleFile'));
      return;
    }

    const fileId = generateUUID();
    setUploadingFiles((prev) => [...prev, fileId]);

    try {
      const newSubtitle: SubtitleFile = {
        id: fileId,
        file,
        language,
        label,
      };

      setSubtitles([...subtitles, newSubtitle]);
      toast.success(t('successSubtitleAdded', { label }));
    } catch {
      toast.error(t('errorFailedToAddSubtitle'));
    } finally {
      setUploadingFiles((prev) => prev.filter((id) => id !== fileId));
    }
  }

  function removeSubtitle(id: string) {
    const subtitleToRemove = subtitles.find((s) => s.id === id);
    setSubtitles(subtitles.filter((subtitle) => subtitle.id !== id));
    if (subtitleToRemove) {
      toast.success(t('successSubtitleRemoved', { label: subtitleToRemove.label }));
    }
  }

  function updateSubtitle(id: string, language: string, label: string) {
    setSubtitles(subtitles.map((s) => (s.id === id ? { ...s, language, label } : s)));
    toast.success(t('successSubtitleLanguageUpdated'));
  }

  function handleSubtitleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];

    if (files.length === 0) return;

    files.forEach((file) => {
      // language detection
      const fileName = file.name.toLowerCase();
      const parts = fileName.split('.');
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : '';
      const detectedLang = getLocalizedLanguageOptions(t).find(
        (lang) => lang.code === potentialLang || fileName.includes(lang.code),
      );

      const defaultLang = detectedLang ? detectedLang.code : 'en';
      const defaultLabel = detectedLang ? detectedLang.label : t('languageEnglish');

      addSubtitle(file, defaultLang, defaultLabel);
    });

    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);

    const files = [...event.dataTransfer.files];
    const subtitleFiles = files.filter(
      (file) => file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt'),
    );

    if (subtitleFiles.length === 0) {
      toast.error(t('errorDropSubtitleFilesOnly'));
      return;
    }

    if (subtitleFiles.length > 5) {
      toast.error(t('errorMaxSubtitleFiles'));
      return;
    }

    subtitleFiles.forEach((file) => {
      const fileName = file.name.toLowerCase();
      const parts = fileName.split('.');
      const potentialLang = parts.length > 2 ? parts[parts.length - 2] : '';
      const detectedLang = getLocalizedLanguageOptions(t).find(
        (lang) => lang.code === potentialLang || fileName.includes(lang.code),
      );

      const defaultLang = detectedLang ? detectedLang.code : 'en';
      const defaultLabel = detectedLang ? detectedLang.label : t('languageEnglish');

      addSubtitle(file, defaultLang, defaultLabel);
    });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
  }

  const fileInputId = `subtitle-upload-${useId()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Languages
            size={16}
            className="text-blue-600"
          />
          {t('subtitles')}
          {subtitles.length > 0 && (
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 hover:bg-blue-100"
            >
              {subtitles.length}
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-2">
          {subtitles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubtitles([]);
                toast.success(t('successAllSubtitlesRemoved'));
              }}
              className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2
                size={12}
                className="mr-1"
              />
              {t('clearAll')}
            </Button>
          )}
          <input
            type="file"
            accept={SUPPORTED_SUBTITLE_FILES}
            onChange={handleSubtitleUpload}
            className="hidden"
            id={fileInputId}
            multiple
            aria-label={t('ariaUploadSubtitleFile')}
          />
          <Label
            htmlFor={fileInputId}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md disabled:opacity-50"
          >
            <Plus size={14} />
            {t('addSubtitle')}
          </Label>
        </div>
      </div>

      {/* Drag and Drop Zone */}
      <motion.div
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all duration-200',
          dragOver ? 'scale-102 border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300',
          subtitles.length === 0 ? 'p-8' : 'p-4',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        animate={{
          scale: dragOver ? 1.02 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-blue-100/50"
          >
            <div className="flex flex-col items-center text-blue-700">
              <UploadCloud className="mb-2 h-8 w-8" />
              <p className="font-medium">{t('dropSubtitleFilesHere')}</p>
            </div>
          </motion.div>
        )}

        {subtitles.length === 0 ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <UploadCloud className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="mb-2 text-sm font-medium text-gray-900">{t('noSubtitlesYet')}</h3>
            <p className="mb-4 text-xs text-gray-500">{t('dragDropSubtitlesInstruction')}</p>
            <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={12} />
                <span>{t('subtitleFormatsSupported')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Info size={12} />
                <span>{t('subtitleFileSizeLimit')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2 text-center">
            <p className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <UploadCloud size={12} />
              {t('dragAdditionalSubtitles')}
            </p>
          </div>
        )}
      </motion.div>

      {/* Upload Progress */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-blue-200 bg-blue-50 p-3"
          >
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('processingFiles', { count: uploadingFiles.length })}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitle List */}
      <AnimatePresence>
        {subtitles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <Separator />
            {subtitles.map((subtitle, index) => (
              <motion.div
                key={subtitle.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, delay: index * 0.1 }}
                className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-100 to-blue-200">
                    <span className="text-xs font-semibold text-blue-700">{index + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium text-gray-900"
                      title={subtitle.file.name}
                    >
                      {subtitle.file.name}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 border-gray-200 text-xs hover:bg-gray-50"
                            >
                              <span className="mr-2">
                                {getLocalizedLanguageOptions(t).find((lang) => lang.code === subtitle.language)?.flag}
                              </span>
                              {subtitle.label}
                              <ChevronDown
                                size={12}
                                className="ml-1 opacity-50"
                              />
                            </Button>
                          }
                        />
                        <DropdownMenuContent
                          align="start"
                          className="w-48"
                        >
                          {getLocalizedLanguageOptions(t).map((lang) => (
                            <DropdownMenuItem
                              key={lang.code}
                              onClick={() => updateSubtitle(subtitle.id, lang.code, lang.label)}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span>{lang.flag}</span>
                              {lang.label}
                              {subtitle.language === lang.code && (
                                <CheckCircle2
                                  size={14}
                                  className="ml-auto text-blue-600"
                                />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Badge
                        variant="outline"
                        className="text-xs"
                      >
                        {(subtitle.file.size / 1024).toFixed(1)} KB
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-green-200 bg-green-50 text-xs text-green-700"
                      >
                        {subtitle.file.name.split('.').pop()?.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSubtitle(subtitle.id)}
                  className="h-8 w-8 p-0 text-gray-400 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                  aria-label={t('removeSubtitleAriaLabel', { filename: subtitle.file.name })}
                >
                  <Trash2 size={14} />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help text */}
      {subtitles.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <Info
              size={14}
              className="mt-0.5 text-gray-400"
            />
            <div>
              <p className="mb-1 font-medium">{t('subtitleGuidelines')}</p>
              <ul className="space-y-1 text-xs text-gray-500">
                <li>• {t('subtitleFormatsInfo')}</li>
                <li>• {t('subtitleFileSizeInfo')}</li>
                <li>• {t('subtitleAutoDetectionInfo')}</li>
                <li>• {t('subtitleBatchUploadInfo')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const VideoSettingsForm = ({
  videoDetails,
  setVideoDetails,
  t,
}: {
  videoDetails: VideoDetails;
  setVideoDetails: (details: VideoDetails) => void;
  t: any;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const subtitles = videoDetails.subtitles || [];

  const setSubtitles = (newSubtitles: SubtitleFile[]) => {
    setVideoDetails({
      ...videoDetails,
      subtitles: newSubtitles,
    });
  };

  const convertToSeconds = (minutes: number, seconds: number) => {
    return minutes * 60 + seconds;
  };

  const convertFromSeconds = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return { minutes, seconds };
  };

  const startTimeParts = convertFromSeconds(videoDetails.startTime);
  const endTimeParts = videoDetails.endTime ? convertFromSeconds(videoDetails.endTime) : { minutes: 0, seconds: 0 };

  const updateStartTime = (minutes: number, seconds: number) => {
    const newStartTime = convertToSeconds(minutes, seconds);
    setVideoDetails({
      ...videoDetails,
      startTime: newStartTime,
      // Auto-adjust end time if it's now invalid
      endTime: videoDetails.endTime && videoDetails.endTime <= newStartTime ? null : videoDetails.endTime,
    });
  };

  const updateEndTime = (minutes: number, seconds: number) => {
    const totalSeconds = convertToSeconds(minutes, seconds);
    if (totalSeconds > videoDetails.startTime) {
      setVideoDetails({
        ...videoDetails,
        endTime: totalSeconds,
      });
    }
  };

  const settingsCount = (() => {
    let count = 0;
    if (videoDetails.startTime > 0) count += 1;
    if (videoDetails.endTime) count += 1;
    if (videoDetails.autoplay) count += 1;
    if (videoDetails.muted) count += 1;
    if (subtitles.length > 0) count += 1;
    return count;
  })();

  const hasTimingErrors = Boolean(videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-6"
    >
      <CollapsibleTrigger
        nativeButton={false}
        render={
          <div className="flex w-full items-center justify-between border-2 p-8 transition-colors duration-200 hover:border-gray-300 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 p-2">
                <Settings
                  size={16}
                  className="text-gray-600"
                />
              </div>
              <div className="text-left">
                <span className="font-medium text-gray-900">{t('additionalSettings')}</span>
                <p className="mt-0.5 text-xs text-gray-500">{t('additionalSettingsDescription')}</p>
              </div>
              {settingsCount > 0 && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                  {t('settingsActiveCount', { count: settingsCount })}
                </Badge>
              )}
            </div>
            <ChevronDown
              size={18}
              className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        }
      />

      <CollapsibleContent className="data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown overflow-hidden">
        <div className="mt-3 space-y-6 rounded-lg border-2 border-gray-100 bg-linear-to-br from-gray-50 to-white p-6 shadow-sm">
          {/* Timing Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Clock
                  size={16}
                  className="text-blue-600"
                />
              </div>
              <h4 className="text-sm font-semibold text-gray-900">{t('timingControls')}</h4>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <TimeInput
                label={t('startTimeLabel')}
                icon={Play}
                minutes={startTimeParts.minutes}
                seconds={startTimeParts.seconds}
                onMinutesChange={(minutes) => updateStartTime(minutes, startTimeParts.seconds)}
                onSecondsChange={(seconds) => updateStartTime(startTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                t={t}
              />
              <TimeInput
                label={t('endTimeLabel')}
                icon={Clock}
                minutes={endTimeParts.minutes}
                seconds={endTimeParts.seconds}
                onMinutesChange={(minutes) => updateEndTime(minutes, endTimeParts.seconds)}
                onSecondsChange={(seconds) => updateEndTime(endTimeParts.minutes, seconds)}
                placeholder={t('minutesPlaceholder')}
                disabled={hasTimingErrors}
                t={t}
              />
            </div>

            {hasTimingErrors && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
              >
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-600"
                />
                <div>
                  <p className="text-sm font-medium text-amber-800">{t('invalidTimeRange')}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    {t('endTimeGreaterThanStartTime', { startTime: formatTime(videoDetails.startTime) })}
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Playback Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <div className="rounded-lg bg-green-100 p-2">
                <Play
                  size={16}
                  className="text-green-600"
                />
              </div>
              <h4 className="text-sm font-semibold text-gray-900">{t('playbackOptions')}</h4>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Label className="flex cursor-pointer items-center space-x-3 rounded-lg border-2 border-gray-200 bg-white p-4 transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/50">
                  <Checkbox
                    checked={videoDetails.autoplay}
                    onCheckedChange={(checked) => {
                      setVideoDetails({
                        ...videoDetails,
                        autoplay: checked,
                      });
                    }}
                    className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                  />
                  <div className="flex items-center gap-2">
                    <Play
                      size={16}
                      className="text-blue-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">{t('autoplay')}</span>
                      <p className="text-xs text-gray-500">{t('autoplayDescription')}</p>
                    </div>
                  </div>
                </Label>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Label className="flex cursor-pointer items-center space-x-3 rounded-lg border-2 border-gray-200 bg-white p-4 transition-all duration-200 hover:border-red-300 hover:bg-red-50/50">
                  <Checkbox
                    checked={videoDetails.muted}
                    onCheckedChange={(checked) => {
                      setVideoDetails({
                        ...videoDetails,
                        muted: checked,
                      });
                    }}
                    className="data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600"
                  />
                  <div className="flex items-center gap-2">
                    <VolumeX
                      size={16}
                      className="text-red-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">{t('startMuted')}</span>
                      <p className="text-xs text-gray-500">{t('startMutedDescription')}</p>
                    </div>
                  </div>
                </Label>
              </motion.div>
            </div>
          </div>

          {/* Subtitle Management */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <Languages
                  size={16}
                  className="text-purple-600"
                />
              </div>
              <h4 className="text-sm font-semibold text-gray-900">{t('subtitlesAndCaptions')}</h4>
            </div>

            <SubtitleManager
              subtitles={subtitles}
              setSubtitles={setSubtitles}
              t={t}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const VideoModal = ({ submitFileActivity, submitExternalVideo, chapterId, course }: any) => {
  const t = useTranslations('Components.VideoModal');
  const org = usePlatform();
  const [video, setVideo] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedView, setSelectedView] = useState<'file' | 'youtube'>('file');
  const [videoDetails, setVideoDetails] = useState<VideoDetails>({
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
    subtitles: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Debug: Log org data when component mounts or org changes
  useEffect(() => {
    console.log('VideoModal - Context data:', {
      org,
      hasOrg: Boolean(org),
      courseProp: course,
      courseData: course?.courseStructure || course,
    });
  }, [org, course]);

  const isYouTubeUrlValid = youtubeUrl ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(youtubeUrl) : false;

  const validateForm = ({
    activityName,
    sourceType,
    selectedVideo,
    submittedYoutubeUrl,
  }: {
    activityName: string;
    sourceType: 'file' | 'youtube';
    selectedVideo: File | null;
    submittedYoutubeUrl: string;
  }) => {
    const newErrors: Record<string, string> = {};

    const youtubeUrlIsValid = submittedYoutubeUrl
      ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(submittedYoutubeUrl)
      : false;

    if (!activityName.trim()) {
      newErrors.name = t('errorActivityNameRequired');
    }

    if (sourceType === 'file' && !selectedVideo) {
      newErrors.video = t('errorPleaseSelectVideoFile');
    }

    if (sourceType === 'youtube' && !submittedYoutubeUrl.trim()) {
      newErrors.youtubeUrl = t('errorYouTubeUrlRequired');
    }

    if (sourceType === 'youtube' && submittedYoutubeUrl && !youtubeUrlIsValid) {
      newErrors.youtubeUrl = t('errorValidYouTubeUrl');
    }

    if (videoDetails.endTime && videoDetails.endTime <= videoDetails.startTime) {
      newErrors.timing = t('errorEndTimeGreaterThanStartTime');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVideoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file size (max 1000MB)
      if (selectedFile.size > 1000 * 1024 * 1024) {
        toast.error(t('errorFileSizeLimit'));
        return;
      }

      // Validate file type
      const validTypes = ['video/mp4', 'video/webm', 'video/x-matroska'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error(t('errorInvalidVideoFileType'));
        return;
      }

      setVideo(selectedFile);
      setErrors((prev) => ({ ...prev, video: '' }));

      // Auto-populate name if empty
      if (!name) {
        const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setName(fileName);
        setErrors((prev) => ({ ...prev, name: '' }));
      }

      toast.success(t('successVideoFileSelected'));
    }
  };

  const canSubmit = (() => {
    if (!name.trim()) return false;
    if (selectedView === 'file') return Boolean(video);
    if (selectedView === 'youtube') return isYouTubeUrlValid;
    return false;
  })();

  const handleSubmit = async (formData: FormData) => {
    const submittedName = String(formData.get('name') ?? '').trim();
    const submittedYoutubeUrl = String(formData.get('youtubeUrl') ?? '').trim();
    const submittedVideo = formData.get('videoFile');
    const selectedVideo = submittedVideo instanceof File && submittedVideo.size > 0 ? submittedVideo : video;

    if (
      !validateForm({
        activityName: submittedName,
        sourceType: selectedView,
        selectedVideo,
        submittedYoutubeUrl,
      })
    ) {
      toast.error(t('errorFixErrorsBeforeSubmitting'));
      return;
    }

    // Handle course data structure (it might be the context object or the course object directly)
    const courseData = course?.courseStructure || course;

    if (!courseData?.course_uuid) {
      console.error('Course data missing:', course);
      toast.error(t('courseDataMissing'));
      return;
    }

    setIsSubmitting(true);

    try {
      if (selectedView === 'file' && selectedVideo) {
        await submitFileActivity(
          selectedVideo,
          'video',
          {
            name: submittedName,
            chapter_id: chapterId,
            activity_type: 'TYPE_VIDEO',
            activity_sub_type: 'SUBTYPE_VIDEO_HOSTED',
            published_version: 1,
            version: 1,
            course_id: courseData.id,
            course_uuid: courseData.course_uuid,
            details: videoDetails,
          },
          chapterId,
        );
        toast.success(t('successVideoActivityCreated'));
      }

      if (selectedView === 'youtube') {
        const external_video_object: ExternalVideoObject = {
          name: submittedName,
          type: 'youtube',
          uri: submittedYoutubeUrl,
          chapter_id: chapterId,
          details: videoDetails,
        };

        await submitExternalVideo(external_video_object, 'activity', chapterId);
        toast.success(t('successYouTubeVideoActivityCreated'));
      }
    } catch (error) {
      console.error('Error creating video activity:', error);
      toast.error(t('errorFailedToCreateVideoActivity'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fileInputId = `video-activity-file-${useId()}`;

  return (
    <div className="mx-auto max-w-4xl">
      <form
        action={handleSubmit}
        className="space-y-6"
      >
        {/* Header */}
        <div className="border-b border-gray-200 pb-4 text-center">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">{t('createVideoActivity')}</h2>
          <p className="text-sm text-gray-600">{t('createVideoActivityDescription')}</p>
        </div>

        {/* Activity Name */}
        <div className="space-y-2">
          <Label
            htmlFor="video-activity-name"
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <FileVideo
              size={16}
              className="text-blue-600"
            />
            {t('activityName')}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            id="video-activity-name"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: '' }));
            }}
            type="text"
            required
            placeholder={t('activityNamePlaceholder')}
            className={cn(
              'w-full transition-all duration-200',
              errors.name
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                : 'focus:border-blue-500 focus:ring-blue-200',
            )}
          />
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1 text-sm text-red-600"
            >
              <AlertCircle size={14} />
              {errors.name}
            </motion.p>
          )}
        </div>

        {/* Video Source Selection */}
        <div className="overflow-hidden rounded-xl border-2 border-gray-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
          <div className="grid grid-cols-2 gap-0 bg-gray-50">
            <motion.button
              type="button"
              onClick={() => {
                setSelectedView('file');
                setErrors((prev) => ({ ...prev, youtubeUrl: '' }));
              }}
              className={cn(
                'relative flex items-center justify-center gap-3 overflow-hidden p-4 transition-all duration-200',
                selectedView === 'file' ? 'z-10 bg-blue-600 text-white shadow-lg' : 'text-gray-700 hover:bg-gray-100',
              )}
              whileHover={{ scale: selectedView !== 'file' ? 1.02 : 1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Upload size={20} />
              <span className="font-medium">{t('uploadVideo')}</span>
              {selectedView === 'file' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 -z-10 bg-blue-600"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
            <motion.button
              type="button"
              onClick={() => {
                setSelectedView('youtube');
                setErrors((prev) => ({ ...prev, video: '' }));
              }}
              className={cn(
                'relative flex items-center justify-center gap-3 overflow-hidden p-4 transition-all duration-200',
                selectedView === 'youtube' ? 'z-10 bg-red-600 text-white shadow-lg' : 'text-gray-700 hover:bg-gray-100',
              )}
              whileHover={{ scale: selectedView !== 'youtube' ? 1.02 : 1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Youtube size={20} />
              <span className="font-medium">{t('youtubeVideo')}</span>
              {selectedView === 'youtube' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 -z-10 bg-red-600"
                  initial={false}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          </div>

          <div className="bg-white p-6">
            <AnimatePresence mode="wait">
              {selectedView === 'file' && (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="space-y-3">
                    <Label
                      htmlFor={fileInputId}
                      className="text-sm font-medium text-gray-700"
                    >
                      {t('videoFile')}
                      <span className="text-red-500">*</span>
                    </Label>
                    <input
                      id={fileInputId}
                      name="videoFile"
                      type="file"
                      accept={SUPPORTED_VIDEO_FILES}
                      onChange={handleVideoChange}
                      className="hidden"
                      aria-label={t('ariaLabel')}
                    />
                    <div className="flex items-center gap-4">
                      <Label
                        htmlFor={fileInputId}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow-md',
                          isSubmitting && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <FileVideo size={18} />
                        {t('chooseVideoFile')}
                      </Label>
                      {video && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
                        >
                          <CheckCircle2 size={16} />
                          <div>
                            <span className="font-medium">{video.name}</span>
                            <span className="ml-2 text-green-600">({(video.size / (1024 * 1024)).toFixed(1)} MB)</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                    {errors.video && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1 text-sm text-red-600"
                      >
                        <AlertCircle size={14} />
                        {errors.video}
                      </motion.p>
                    )}
                    <p className="flex items-center gap-2 text-xs text-gray-500">
                      <Info size={12} />
                      {t('supportedFormatsAndSize')}
                    </p>
                  </div>
                </motion.div>
              )}

              {selectedView === 'youtube' && (
                <motion.div
                  key="youtube"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label
                      htmlFor="youtube-url"
                      className="text-sm font-medium text-gray-700"
                    >
                      {t('youtubeUrl')}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="youtube-url"
                      name="youtubeUrl"
                      value={youtubeUrl}
                      onChange={(e) => {
                        setYoutubeUrl(e.target.value);
                        setErrors((prev) => ({ ...prev, youtubeUrl: '' }));
                      }}
                      type="url"
                      required
                      placeholder={t('youtubeUrlPlaceholder')}
                      className={cn(
                        'w-full transition-all duration-200',
                        errors.youtubeUrl
                          ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                          : youtubeUrl && isYouTubeUrlValid
                            ? 'border-green-300 focus:border-green-500 focus:ring-green-200'
                            : 'focus:border-blue-500 focus:ring-blue-200',
                      )}
                    />
                    {errors.youtubeUrl && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1 text-sm text-red-600"
                      >
                        <AlertCircle size={14} />
                        {errors.youtubeUrl}
                      </motion.p>
                    )}
                    {youtubeUrl && isYouTubeUrlValid && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1 text-sm text-green-600"
                      >
                        <CheckCircle2 size={14} />
                        {t('validYouTubeUrl')}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Video Settings */}
        <VideoSettingsForm
          videoDetails={videoDetails}
          setVideoDetails={setVideoDetails}
          t={t}
        />

        {errors.timing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
          >
            <AlertTriangle
              size={16}
              className="text-red-600"
            />
            <p className="text-sm text-red-700">{errors.timing}</p>
          </motion.div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <Button
            type="submit"
            disabled={isSubmitting || !canSubmit}
            className={cn(
              'px-8 py-3 shadow-sm transition-all duration-200 hover:shadow-md',
              canSubmit ? 'bg-blue-600 text-white hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300 text-gray-500',
            )}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('creating')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Plus size={18} />
                {t('createActivity')}
              </div>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default VideoModal;
