'use server';
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

export async function getPaymentConfigs(access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/config`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await errorHandling(result);
}

export async function checkPaidAccess(courseId: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/courses/${courseId}/access`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await errorHandling(result);
}

export async function initializePaymentConfig(data: any, provider: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/config?provider=${provider}`,
    RequestBodyWithAuthHeader('POST', data, null, access_token),
  );
  const responseData = await errorHandling(result);

  // Revalidate platform cache after initializing payment config
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return responseData;
}

export async function updatePaymentConfig(id: string, data: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/config?id=${id}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const responseData = await errorHandling(result);

  // Revalidate platform cache after updating payment config
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return responseData;
}

export async function updateStripeAccountID(data: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/stripe/account?stripe_account_id=${data.stripe_account_id}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const responseData = await errorHandling(result);

  // Revalidate platform cache after updating Stripe account
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return responseData;
}

export async function getStripeOnboardingLink(access_token: string, redirect_uri: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/stripe/connect/link?redirect_uri=${redirect_uri}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  return await errorHandling(result);
}

export async function verifyStripeConnection(code: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/stripe/oauth/callback?code=${code}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await errorHandling(result);
}

export async function deletePaymentConfig(id: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/config?id=${id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const responseData = await errorHandling(result);

  // Revalidate platform cache after deleting payment config
  if (result.ok) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.platform, 'max');
  }

  return responseData;
}

export async function getCustomers(access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/customers`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await errorHandling(result);
}

export async function getOwnedCourses(access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/courses/owned`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await errorHandling(result);
}
