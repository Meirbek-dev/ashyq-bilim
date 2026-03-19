'use server';
import { RequestBodyWithAuthHeader, getResponseMetadata } from '@services/utils/ts/requests';
import { getAPIUrl } from '@services/config/config';
import { tags } from '@/lib/cacheTags';

export async function getProducts(access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function createProduct(data: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products`,
    RequestBodyWithAuthHeader('POST', data, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after creating product
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function updateProduct(productId: string, data: any, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after updating product
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function archiveProduct(productId: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after archiving product
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function getProductDetails(productId: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function linkCourseToProduct(productId: string, courseId: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}/courses/${courseId}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after linking course to product
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function unlinkCourseFromProduct(productId: string, courseId: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}/courses/${courseId}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token),
  );
  const metadata = await getResponseMetadata(result);

  // Revalidate courses cache after unlinking course from product
  if (metadata.success) {
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tags.courses, 'max');
  }

  return metadata;
}

export async function getCoursesLinkedToProduct(productId: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/products/${productId}/courses`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function getProductsByCourse(courseId: number, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/courses/${courseId}/products`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  );
  return await getResponseMetadata(result);
}

export async function getStripeProductCheckoutSession(productId: number, redirect_uri: string, access_token: string) {
  const result = await fetch(
    `${getAPIUrl()}payments/stripe/checkout/product/${productId}?redirect_uri=${redirect_uri}`,
    RequestBodyWithAuthHeader('POST', null, null, access_token),
  );
  return await getResponseMetadata(result);
}
