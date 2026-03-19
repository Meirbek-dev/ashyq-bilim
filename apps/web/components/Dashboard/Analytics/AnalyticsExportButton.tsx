'use client';

import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface AnalyticsExportButtonProps {
  href: string;
  label: string;
}

export default function AnalyticsExportButton({ href, label }: AnalyticsExportButtonProps) {
  const session = usePlatformSession();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const accessToken = session.data?.tokens?.access_token;
      const headers: HeadersInit = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const response = await fetch(href, { headers });
      if (!response.ok) {
        console.error(`Export failed: ${response.status} ${response.statusText}`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      // Infer filename from the URL path
      const pathWithoutQuery = href.split('?').shift() ?? href;
      const pathParts = pathWithoutQuery.split('/');
      anchor.download = pathParts[pathParts.length - 1] ?? 'export.csv';
      anchor.href = url;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  );
}
