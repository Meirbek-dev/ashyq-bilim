'use client';

import { useCourse } from '@components/Contexts/CourseContext';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

type SaveResponse = { success?: boolean; status?: number; data?: any } | void;

interface SaveSectionOptions {
  onSuccess?: () => void;
  onError?: (message: string) => void;
  successMessage?: string;
  errorMessage?: string;
}

interface SaveInvocationOptions {
  onSuccess?: () => void;
  successMessage?: string;
  errorMessage?: string;
  refresh?: 'meta' | 'editor';
}

function normalizeResponse(response: SaveResponse) {
  if (response && typeof response === 'object' && 'success' in response) {
    return response;
  }

  return { success: true, data: response };
}

/**
 * Centralised save handler for course workspace sections.
 *
 * Wraps the common pattern of:
 *  - setting isSaving state
 *  - calling the API
 *  - handling 409 conflict via CourseContext.showConflict
 *  - showing a toast on success or error
 *  - calling onSuccess (e.g. markClean)
 *  - refreshing SWR via refreshCourseMeta (single source of truth — no optimistic dispatch)
 */
export function useSaveSection(options?: SaveSectionOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const { showConflict, refreshCourseMeta, refreshCourseEditor } = useCourse();

  const runSave = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: SaveInvocationOptions) => {
      setIsSaving(true);
      try {
        const response = normalizeResponse(await saveFn());

        if (!response.success) {
          if (response.status === 409) {
            const detail = response.data?.detail;
            showConflict(typeof detail === 'string' ? detail : undefined);
            return;
          }
          const message =
            typeof response.data?.detail === 'string'
              ? response.data.detail
              : invocationOptions?.errorMessage || options?.errorMessage || 'Failed to save. Please try again.';
          options?.onError?.(message);
          toast.error(message);
          return;
        }

        if ((invocationOptions?.refresh || 'meta') === 'editor') {
          await refreshCourseEditor();
        } else {
          await refreshCourseMeta();
        }

        const successMessage = invocationOptions?.successMessage || options?.successMessage || 'Изменения сохранены';
        if (successMessage) {
          toast.success(successMessage);
        }

        invocationOptions?.onSuccess?.();
        options?.onSuccess?.();
      } catch (error: any) {
        if (error?.status === 409) {
          showConflict(error?.detail || error?.message);
          return;
        }
        const message =
          error?.message ||
          invocationOptions?.errorMessage ||
          options?.errorMessage ||
          'Failed to save. Please try again.';
        options?.onError?.(message);
        toast.error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [options, refreshCourseEditor, refreshCourseMeta, showConflict],
  );

  const save = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: Omit<SaveInvocationOptions, 'refresh'>) => {
      await runSave(saveFn, { ...invocationOptions, refresh: 'meta' });
    },
    [runSave],
  );

  const saveWithEditorRefresh = useCallback(
    async (saveFn: () => Promise<SaveResponse>, invocationOptions?: Omit<SaveInvocationOptions, 'refresh'>) => {
      await runSave(saveFn, { ...invocationOptions, refresh: 'editor' });
    },
    [runSave],
  );

  return { isSaving, save, saveWithEditorRefresh };
}
