import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';

export async function searchOrgContent(query: string, page = 1, limit = 20, next: any, access_token?: any) {
  const result: any = await fetch(
    `${getAPIUrl()}search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token),
  );
  return await getResponseMetadata(result);
}
