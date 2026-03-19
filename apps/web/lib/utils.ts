import { twMerge } from 'tailwind-merge';
import type { ClassValue } from 'clsx';
import { nanoid } from 'nanoid';
import { clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  } as T;
}

/**
 * Generates a UUID that works in both client and server environments
 * Falls back to a nanoid if crypto.randomUUID is not available
 */
export function generateUUID(): string {
  // Try to use native crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return nanoid();
}
