'use server';

import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload';
import { CacheProfiles, cacheLife, cacheTag } from '@/lib/cache';
import { getAPIUrl } from '@services/config/config';
import { courseTag, tags } from '@/lib/cacheTags';

interface UploadProgress {
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

interface ActivityInvalidationOptions {
  courseUuid?: string;
  lastKnownUpdateDate?: string | null;
}

async function revalidateActivityCourseTags(options?: ActivityInvalidationOptions) {
  const { revalidateTag } = await import('next/cache');
  revalidateTag(tags.activities, 'max');
  revalidateTag(options?.courseUuid ? courseTag.detail(options.courseUuid) : tags.courses, 'max');
}

export async function createActivity(
  data: any,
  chapter_id: number,
  access_token: string,
  options?: ActivityInvalidationOptions,
) {
  // Only set empty content if not already provided
  if (!data.content) {
    data.content = {};
  }
  // ensure the server receives the target chapter so the activity is created under that chapter
  data.chapter_id = chapter_id;
  data.last_known_update_date = options?.lastKnownUpdateDate ?? data.last_known_update_date ?? undefined;

  const result = await fetch(`${getAPIUrl()}activities/`, RequestBodyWithAuthHeader('POST', data, null, access_token));
  const metaData = await getResponseMetadata(result);

  // Revalidate activities and courses cache after creating activity
  if (metaData.success) {
    await revalidateActivityCourseTags(options);
  }

  return metaData;
}

/**
 * Builds video details object from data for FormData submission
 */
function buildVideoDetails(details: any): string {
  const detailsToSend: any = {
    startTime: details.startTime || 0,
    endTime: details.endTime || null,
    autoplay: details.autoplay,
    muted: details.muted,
  };

  if (details.subtitles) {
    detailsToSend.subtitles = details.subtitles.map((subtitle: any) => ({
      id: subtitle.id,
      language: subtitle.language,
      label: subtitle.label,
    }));
  }

  return JSON.stringify(detailsToSend);
}

/**
 * Appends subtitle files to FormData
 */
function appendSubtitleFiles(formData: FormData, subtitles: any[]): void {
  subtitles.forEach((subtitle: any) => {
    if (subtitle.file) {
      formData.append('subtitle_files', subtitle.file);
    }
  });
}

/**
 * Upload FormData with progress tracking - uses XHR in browser, fetch on server
 */
async function uploadFormData(
  endpoint: string,
  formData: FormData,
  accessToken: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  // Server or non-browser environment - use fetch without progress tracking
  if (typeof XMLHttpRequest === 'undefined') {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    if (!result.ok) {
      let detail = `Upload failed with status ${result.status}`;
      try {
        const errorData = await result.json();
        if (typeof errorData?.detail === 'string') {
          ({ detail } = errorData);
        }
      } catch {
        // Ignore JSON parse failures and preserve the generic message.
      }
      const error: any = new Error(detail);
      error.status = result.status;
      error.detail = detail;
      throw error;
    }

    const json = await result.json();
    if (onProgress) {
      try {
        onProgress({ percentage: 100 });
      } catch {
        // If onProgress isn't callable in this context, ignore
      }
    }
    return json;
  }

  // Browser environment - use XHR for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({ percentage: Math.round((e.loaded / e.total) * 100) });
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        let detail = `Upload failed with status ${xhr.status}`;
        try {
          const errorData = JSON.parse(xhr.responseText || '{}');
          if (typeof errorData?.detail === 'string') {
            ({ detail } = errorData);
          }
        } catch {
          // Ignore parse failures and preserve the generic message.
        }
        const error: any = new Error(detail);
        error.status = xhr.status;
        error.detail = detail;
        reject(error);
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.send(formData);
  });
}

/**
 * Create video activity with chunked upload for large files
 */
async function createVideoActivityChunked(
  file: File,
  data: any,
  chapterId: number,
  accessToken: string,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  const courseUuid = data.course_uuid;

  if (!courseUuid) {
    throw new Error('Missing course_uuid for chunked upload');
  }

  const tempActivityUuid = `activity_temp_${Date.now()}`;
  const videoFormat = file.name.split('.').pop() || 'mp4';

  // Upload video file in chunks first
  await uploadFileChunked({
    file,
    directory: `courses/${courseUuid}/activities/${tempActivityUuid}/video`,
    typeOfDir: 'platform',
    filename: `video.${videoFormat}`,
    accessToken,
    onProgress: (progress) => {
      onProgress?.({
        percentage: progress.percentage,
        currentChunk: progress.currentChunk,
        totalChunks: progress.totalChunks,
      });
    },
  });

  // Create activity with uploaded video reference
  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('name', data.name);
  if (options?.lastKnownUpdateDate) {
    formData.append('last_known_update_date', options.lastKnownUpdateDate);
  }
  formData.append(
    'video_uploaded_path',
    `courses/${courseUuid}/activities/${tempActivityUuid}/video/video.${videoFormat}`,
  );

  if (data.details?.subtitles && Array.isArray(data.details.subtitles)) {
    appendSubtitleFiles(formData, data.details.subtitles);
  }

  if (data.details) {
    formData.append('details', buildVideoDetails(data.details));
  }

  const result = await fetch(`${getAPIUrl()}activities/video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!result.ok) {
    let detail = `Failed to create activity: ${result.status}`;
    try {
      const errorData = await result.json();
      if (typeof errorData?.detail === 'string') {
        ({ detail } = errorData);
      }
    } catch {
      // Ignore JSON parse failures and preserve the generic message.
    }
    const error: any = new Error(detail);
    error.status = result.status;
    error.detail = detail;
    throw error;
  }

  return result.json();
}

/**
 * Create video activity with standard upload
 */
async function createVideoActivityStandard(
  file: File,
  data: any,
  chapterId: number,
  accessToken: string,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  formData.append('name', data.name);
  if (options?.lastKnownUpdateDate) {
    formData.append('last_known_update_date', options.lastKnownUpdateDate);
  }
  formData.append('video_file', file);

  if (data.details?.subtitles && Array.isArray(data.details.subtitles)) {
    appendSubtitleFiles(formData, data.details.subtitles);
  }

  if (data.details) {
    formData.append('details', buildVideoDetails(data.details));
  }

  return uploadFormData(`${getAPIUrl()}activities/video`, formData, accessToken, onProgress);
}

/**
 * Create PDF document activity
 */
async function createPdfActivity(
  file: File,
  data: any,
  chapterId: number,
  accessToken: string,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  const formData = new FormData();
  formData.append('chapter_id', chapterId.toString());
  if (options?.lastKnownUpdateDate) {
    formData.append('last_known_update_date', options.lastKnownUpdateDate);
  }
  formData.append('pdf_file', file);
  formData.append('name', data.name);

  return uploadFormData(`${getAPIUrl()}activities/documentpdf`, formData, accessToken, onProgress);
}

/**
 * Create file-based activity (video or PDF)
 */
export async function createFileActivity(
  file: File,
  type: string,
  data: any,
  chapterId: number,
  accessToken: string,
  options?: ActivityInvalidationOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<any> {
  if (type === 'video') {
    if (shouldUseChunkedUpload(file.size)) {
      console.log('Using chunked upload for video activity');
      return createVideoActivityChunked(file, data, chapterId, accessToken, options, onProgress);
    }
    return createVideoActivityStandard(file, data, chapterId, accessToken, options, onProgress);
  }

  if (type === 'documentpdf') {
    return createPdfActivity(file, data, chapterId, accessToken, options, onProgress);
  }

  throw new Error(`Unsupported file activity type: ${type}`);
}

export async function createExternalVideoActivity(
  data: any,
  activity: any,
  chapter_id: number,
  access_token: string,
  options?: ActivityInvalidationOptions,
) {
  // add coursechapter_id to data
  data.chapter_id = chapter_id;
  data.activity_id = activity.id;

  // Add video details with null checking
  const defaultDetails = {
    startTime: 0,
    endTime: null,
    autoplay: false,
    muted: false,
  };
  const videoDetails = data.details
    ? {
        startTime: data.details.startTime ?? defaultDetails.startTime,
        endTime: data.details.endTime ?? defaultDetails.endTime,
        autoplay: data.details.autoplay ?? defaultDetails.autoplay,
        muted: data.details.muted ?? defaultDetails.muted,
      }
    : defaultDetails;
  data.details = JSON.stringify(videoDetails);
  data.last_known_update_date = options?.lastKnownUpdateDate ?? data.last_known_update_date ?? undefined;
  const result = await fetch(
    `${getAPIUrl()}activities/external_video`,
    RequestBodyWithAuthHeader('POST', data, null, access_token),
  );
  return getResponseMetadata(result);
}

/**
 * Cached fetch for activity by UUID
 */
async function fetchActivity(activity_uuid: string, access_token: string) {
  'use cache';
  cacheTag(tags.activities);
  cacheLife(CacheProfiles.activities);

  const result = await fetch(`${getAPIUrl()}activities/${activity_uuid}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
  });
  return result.json();
}

export async function getActivity(activity_uuid: string, _next?: any, access_token?: string) {
  if (!access_token) {
    throw new Error('Access token required');
  }
  return fetchActivity(activity_uuid, access_token);
}

/**
 * Cached fetch for activity by ID
 */
async function fetchActivityById(activity_id: number, access_token: string) {
  'use cache';
  cacheTag(tags.activities);
  cacheLife(CacheProfiles.activities);

  const result = await fetch(`${getAPIUrl()}activities/id/${activity_id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
  });
  return result.json();
}

export async function getActivityByID(activity_id: number, _next?: any, access_token?: string) {
  if (!access_token) {
    throw new Error('Access token required');
  }
  return fetchActivityById(activity_id, access_token);
}

export async function deleteActivity(
  activity_uuid: string,
  access_token: string,
  options?: ActivityInvalidationOptions,
) {
  const query = new URLSearchParams();
  if (options?.lastKnownUpdateDate) {
    query.set('last_known_update_date', options.lastKnownUpdateDate);
  }

  const result = await fetch(
    `${getAPIUrl()}activities/${activity_uuid}${query.size > 0 ? `?${query.toString()}` : ''}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const data = await getResponseMetadata(result);

  // Revalidate activities cache after deletion
  if (result.ok) {
    await revalidateActivityCourseTags(options);
  }

  return data;
}

/**
 * Cached fetch for activity with auth header
 */
async function fetchActivityWithAuth(activity_uuid: string, access_token?: string) {
  'use cache';
  cacheTag(tags.activities);
  cacheLife(CacheProfiles.activities);

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`;
  }

  const result = await fetch(`${getAPIUrl()}activities/activity_${activity_uuid}`, {
    method: 'GET',
    headers,
  });
  return result.json();
}

export async function getActivityWithAuthHeader(activity_uuid: string, _next?: any, access_token?: string | null) {
  return fetchActivityWithAuth(activity_uuid, access_token || undefined);
}

export async function updateActivity(
  data: any,
  activity_uuid: string,
  access_token: string,
  options?: ActivityInvalidationOptions,
) {
  const result = await fetch(
    `${getAPIUrl()}activities/${activity_uuid}`,
    RequestBodyWithAuthHeader(
      'PUT',
      {
        ...data,
        last_known_update_date: options?.lastKnownUpdateDate ?? data.last_known_update_date ?? undefined,
      },
      null,
      access_token,
    ),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate caches so updated content is visible to all users
  if (metadata.success) {
    await revalidateActivityCourseTags(options);
  }

  return metadata;
}

export async function getUrlPreview(url: string) {
  const result = await fetch(
    `${getAPIUrl()}utils/link-preview?url=${url}`,
    RequestBodyWithAuthHeader('GET', null, null),
  );
  return await result.json();
}
