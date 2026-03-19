import { getAPIUrl } from '@services/config/config';

export function getPaymentsProductsSwrKey() {
  return `${getAPIUrl()}payments/products`;
}

export function getProductLinkedCoursesSwrKey(productId: string | null | undefined) {
  if (!productId) return '';
  return `${getAPIUrl()}payments/products/${productId}/courses`;
}

export function getPaymentsConfigSwrKey() {
  return `${getAPIUrl()}payments/config`;
}

export function getPaymentsCustomersSwrKey() {
  return `${getAPIUrl()}payments/customers`;
}
