/**
 * useAntiCheatViolations — Tracks and reports anti-cheat violations during an attempt.
 *
 * Monitors tab switches, copy/paste, fullscreen exits, and DevTools opening.
 * Reports violations to the server and maintains a local count for the UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type ViolationKind = 'TAB_SWITCH' | 'COPY_PASTE' | 'FULLSCREEN_EXIT' | 'DEVTOOLS';

interface AntiCheatConfig {
  tabSwitchDetection: boolean;
  copyPasteProtection: boolean;
  fullscreenEnforced: boolean;
  devtoolsDetection: boolean;
}

interface UseAntiCheatViolationsOptions {
  config: AntiCheatConfig;
  enabled: boolean;
  onViolation?: (kind: ViolationKind, count: number) => void;
}

interface UseAntiCheatViolationsResult {
  violationCount: number;
  violations: { kind: ViolationKind; timestamp: number }[];
}

export function useAntiCheatViolations({
  config,
  enabled,
  onViolation,
}: UseAntiCheatViolationsOptions): UseAntiCheatViolationsResult {
  const [violations, setViolations] = useState<{ kind: ViolationKind; timestamp: number }[]>([]);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const recordViolation = useCallback((kind: ViolationKind) => {
    setViolations((prev) => {
      const next = [...prev, { kind, timestamp: Date.now() }];
      onViolationRef.current?.(kind, next.length);
      return next;
    });
  }, []);

  // Tab switch detection
  useEffect(() => {
    if (!enabled || !config.tabSwitchDetection) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('TAB_SWITCH');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, config.tabSwitchDetection, recordViolation]);

  // Copy/paste protection
  useEffect(() => {
    if (!enabled || !config.copyPasteProtection) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation('COPY_PASTE');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      recordViolation('COPY_PASTE');
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [enabled, config.copyPasteProtection, recordViolation]);

  // Fullscreen enforcement
  useEffect(() => {
    if (!enabled || !config.fullscreenEnforced) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordViolation('FULLSCREEN_EXIT');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [enabled, config.fullscreenEnforced, recordViolation]);

  return {
    violationCount: violations.length,
    violations,
  };
}
