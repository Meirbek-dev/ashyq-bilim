import { ArrowBigUpDash, Image as ImageIcon, UploadCloud, Video } from 'lucide-react';
import { useCourse, useCourseDispatch } from '@components/Contexts/CourseContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@components/ui/alert';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import { updateCourseThumbnail } from '@services/courses/courses';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type React from 'react';

const MAX_FILE_SIZE = 8_000_000; // 8MB for images
const MAX_VIDEO_FILE_SIZE = 100_000_000; // 100MB for videos
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const;
const VALID_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/x-matroska'] as const;

type ValidImageMimeType = (typeof VALID_IMAGE_MIME_TYPES)[number];
type ValidVideoMimeType = (typeof VALID_VIDEO_MIME_TYPES)[number];

interface ThumbnailUpdateProps {
  thumbnailType: 'image' | 'video' | 'both';
  disabled?: boolean;
  disabledReason?: string;
}

type TabType = 'image' | 'video';

interface LocalThumbnail {
  file: File;
  url: string;
  type: 'image' | 'video';
}

const ThumbnailUpdate = ({ thumbnailType, disabled = false, disabledReason }: ThumbnailUpdateProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const course = useCourse();
  const dispatchCourse = useCourseDispatch();
  const session = usePlatformSession() as any;
  const t = useTranslations('CourseEdit.General.Thumbnail');

  const [localThumbnail, setLocalThumbnail] = useState<LocalThumbnail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(thumbnailType === 'video' ? 'video' : 'image');

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (localThumbnail?.url) {
        URL.revokeObjectURL(localThumbnail.url);
      }
    };
  }, [localThumbnail]);
  const showError = useCallback((message: string) => {
    toast.error(message, {
      duration: 3000,
      position: 'top-center',
    });
  }, []);

  const validateFile = useCallback(
    (file: File, type: 'image' | 'video'): boolean => {
      if (type === 'image') {
        if (!VALID_IMAGE_MIME_TYPES.includes(file.type as ValidImageMimeType)) {
          showError(t('errors.invalidMimeType', { fileType: file.type }));
          return false;
        }

        if (file.size > MAX_FILE_SIZE) {
          showError(
            t('errors.fileTooLarge', {
              fileSize: (file.size / 1024 / 1024).toFixed(2),
            }),
          );
          return false;
        }
      } else {
        if (!VALID_VIDEO_MIME_TYPES.includes(file.type as ValidVideoMimeType)) {
          showError(t('errors.invalidVideoMimeType', { fileType: file.type }));
          return false;
        }

        if (file.size > MAX_VIDEO_FILE_SIZE) {
          showError(
            t('errors.videoFileTooLarge', {
              fileSize: (file.size / 1024 / 1024).toFixed(2),
            }),
          );
          return false;
        }
      }

      return true;
    },
    [showError, t],
  );

  const updateThumbnail = useCallback(
    async (file: File, type: 'image' | 'video') => {
      setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append('thumbnail', file);
        formData.append('thumbnail_type', type);

        const res = await updateCourseThumbnail(
          course.courseStructure.course_uuid,
          formData,
          session.data?.tokens?.access_token,
          {
            lastKnownUpdateDate: course.courseStructure.update_date,
          },
        );

        if (!res.success) {
          showError(res.HTTPmessage);
        } else {
          if (res.data) {
            dispatchCourse({ type: 'setCourseStructure', payload: res.data });
          } else {
            await course.refreshCourseMeta();
          }
          setLocalThumbnail(null);
          toast.success(t('thumbnailUpdatedSuccessfully'), {
            duration: 3000,
            position: 'top-center',
          });
        }
      } catch {
        showError(t('errors.updateFailed'));
      } finally {
        setIsLoading(false);
      }
    },
    [course, dispatchCourse, session, showError, t],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
      const file = event.target.files?.[0];

      if (!file) {
        showError(t('errors.pleaseSelectAFile'));
        return;
      }

      if (!validateFile(file, type)) {
        event.target.value = '';
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      setLocalThumbnail({ file, url: blobUrl, type });
      await updateThumbnail(file, type);
    },
    [showError, validateFile, updateThumbnail, t],
  );

  const getThumbnailUrl = useCallback(
    (type: 'image' | 'video') => {
      if (type === 'image') {
        return course.courseStructure.thumbnail_image
          ? getCourseThumbnailMediaDirectory(course.courseStructure.course_uuid, course.courseStructure.thumbnail_image)
          : '/empty_thumbnail.webp';
      }
      return course.courseStructure.thumbnail_video
        ? getCourseThumbnailMediaDirectory(course.courseStructure.course_uuid, course.courseStructure.thumbnail_video)
        : undefined;
    },
    [course],
  );

  const renderThumbnailPreview = useCallback(() => {
    const thumbnailToShow = localThumbnail || {
      url: getThumbnailUrl(activeTab),
      type: activeTab,
    };

    if (!thumbnailToShow.url) {
      return (
        <div className="mx-auto flex h-[270px] max-w-[480px] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50">
          <div className="text-center">
            <ImageIcon className="text-muted-foreground mx-auto h-12 w-12" />
            <p className="text-muted-foreground mt-2 text-sm">
              {activeTab === 'image' ? t('noImageThumbnail') : t('noVideoThumbnail')}
            </p>
          </div>
        </div>
      );
    }

    if (thumbnailToShow.type === 'video' || activeTab === 'video') {
      return (
        <div className="mx-auto max-w-[480px]">
          <video
            src={thumbnailToShow.url}
            className={`aspect-video w-full rounded-lg border border-border object-cover shadow-sm ${
              isLoading ? 'animate-pulse' : ''
            }`}
            controls
          />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-[480px]">
        <img
          src={thumbnailToShow.url}
          alt={localThumbnail ? t('thumbnailPreviewAlt') : t('currentThumbnailAlt')}
          className={`aspect-video w-full rounded-lg border border-border object-cover shadow-sm ${
            isLoading ? 'animate-pulse' : ''
          }`}
        />
      </div>
    );
  }, [localThumbnail, activeTab, getThumbnailUrl, isLoading, t]);

  const renderImageControls = () => (
    <>
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png"
        onChange={(e) => handleFileChange(e, 'image')}
        aria-label={t('ariaLabelImage')}
        disabled={isLoading || disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="default"
        disabled={isLoading || disabled}
        onClick={() => imageInputRef.current?.click()}
        className="flex-1"
      >
        <UploadCloud className="mr-2 h-4 w-4" />
        {t('uploadImageButton')}
      </Button>
    </>
  );

  const renderVideoControls = () => (
    <>
      <input
        ref={videoInputRef}
        type="file"
        className="hidden"
        accept=".mp4,.webm,.mkv"
        onChange={(e) => handleFileChange(e, 'video')}
        aria-label={t('ariaLabelVideo')}
        disabled={isLoading || disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="default"
        disabled={isLoading || disabled}
        onClick={() => videoInputRef.current?.click()}
        className="flex-1"
      >
        <Video className="mr-2 h-4 w-4" />
        {t('uploadVideo')}
      </Button>
    </>
  );

  if (thumbnailType === 'both') {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabType)}
          >
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger
                value="image"
                disabled={isLoading || disabled}
              >
                <ImageIcon className="mr-2 h-4 w-4" />
                {t('image')}
              </TabsTrigger>
              <TabsTrigger
                value="video"
                disabled={isLoading || disabled}
              >
                <Video className="mr-2 h-4 w-4" />
                {t('video')}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="image"
              className="space-y-6"
            >
              {renderThumbnailPreview()}

              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="text-muted-foreground flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-sm font-medium">
                    <ArrowBigUpDash className="h-4 w-4 animate-bounce" />
                    {t('uploading')}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">{renderImageControls()}</div>
              )}

              <p className="text-muted-foreground text-center text-xs">{t('supportedFormats')}</p>
              {disabledReason ? (
                <Alert className="border-border bg-muted/60">
                  <AlertTitle>{t('uploadImageButton')}</AlertTitle>
                  <AlertDescription>{disabledReason}</AlertDescription>
                </Alert>
              ) : null}
            </TabsContent>

            <TabsContent
              value="video"
              className="space-y-6"
            >
              {renderThumbnailPreview()}

              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="text-muted-foreground flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-sm font-medium">
                    <ArrowBigUpDash className="h-4 w-4 animate-bounce" />
                    {t('uploading')}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">{renderVideoControls()}</div>
              )}

              <p className="text-muted-foreground text-center text-xs">{t('supportedVideoFormats')}</p>
              {disabledReason ? (
                <Alert className="border-border bg-muted/60">
                  <AlertTitle>{t('uploadVideo')}</AlertTitle>
                  <AlertDescription>{disabledReason}</AlertDescription>
                </Alert>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  // Single tab view (image or video only)
  return (
    <Card className="w-full">
      <CardContent className="space-y-6 p-6">
        {renderThumbnailPreview()}

        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-2 rounded-full border bg-muted px-4 py-2 text-sm font-medium">
              <ArrowBigUpDash className="h-4 w-4 animate-bounce" />
              {t('uploading')}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">{thumbnailType === 'image' ? renderImageControls() : renderVideoControls()}</div>
        )}

        <p className="text-muted-foreground text-center text-xs">
          {thumbnailType === 'image' ? t('supportedFormats') : t('supportedVideoFormats')}
        </p>
        {disabledReason ? (
          <Alert className="border-border bg-muted/60">
            <AlertTitle>{thumbnailType === 'image' ? t('uploadImageButton') : t('uploadVideo')}</AlertTitle>
            <AlertDescription>{disabledReason}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default ThumbnailUpdate;
