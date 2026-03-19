import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader } from '@services/utils/ts/requests';
import { shouldUseChunkedUpload, uploadFileChunked } from '@services/utils/chunked-upload';
import { getAPIUrl } from '@services/config/config';

export async function uploadNewVideoFile(
  file: File,
  activity_uuid: string,
  access_token: string,
  course_uuid?: string,
  block_uuid?: string,
  onProgress?: (progress: { percentage: number; currentChunk: number; totalChunks: number }) => void,
) {
  // For large files, use chunked upload
  if (shouldUseChunkedUpload(file.size)) {
    console.log('Using chunked upload for large file');

    if (!course_uuid) {
      throw new Error('course_uuid is required for chunked uploads');
    }

    if (!block_uuid) {
      throw new Error('block_uuid is required for chunked uploads');
    }

    try {
      const result = await uploadFileChunked({
        file,
        // Use full courses path and include the block folder so the saved file is where the editor expects it
        directory: `courses/${course_uuid}/activities/${activity_uuid}/dynamic/blocks/videoBlock/${block_uuid}`,
        typeOfDir: 'platform',
        filename: `block_${Date.now()}.${file.name.split('.').pop()}`,
        accessToken: access_token,
        onProgress: onProgress
          ? (progress) =>
              onProgress({
                percentage: progress.percentage,
                currentChunk: progress.currentChunk,
                totalChunks: progress.totalChunks,
              })
          : undefined,
      });

      // The uploads `/complete` returns the saved filename (e.g. block_xxx.mp4).
      // Construct a block-like object to match the shape returned by the backend
      // so the editor can display the uploaded video immediately.
      const savedFilename = result.filename;
      const dotIndex = savedFilename.lastIndexOf('.');
      const fileFormat = dotIndex !== -1 ? savedFilename.slice(dotIndex + 1) : 'bin';
      const fileId = dotIndex !== -1 ? savedFilename.slice(0, dotIndex) : savedFilename;

      return {
        block_uuid: block_uuid,
        content: {
          file_id: fileId,
          file_format: fileFormat,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          activity_uuid: activity_uuid,
        },
      };
    } catch (error: any) {
      console.error('Chunked upload error:', error);
      // Try to expose a readable message
      const message = error?.message || JSON.stringify(error);
      throw new Error(message, { cause: error });
    }
  }

  // For smaller files, use traditional upload
  const formData = new FormData();
  formData.append('file_object', file);
  formData.append('activity_uuid', activity_uuid);
  try {
    const result = await fetch(
      `${getAPIUrl()}blocks/video`,
      RequestBodyFormWithAuthHeader('POST', formData, null, access_token),
    );
    return await result.json();
  } catch (error) {
    console.error('error', error);
    throw error;
  }
}

export async function getVideoFile(file_id: string, access_token: string) {
  try {
    const result = await fetch(
      `${getAPIUrl()}blocks/video?file_id=${file_id}`,
      RequestBodyWithAuthHeader('GET', null, null, access_token),
    );
    return await result.json();
  } catch (error) {
    console.error('error', error);
    throw error;
  }
}
