import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

interface LinkInputTooltipProps {
  onSave: (url: string) => void;
  onCancel: () => void;
  currentUrl?: string;
}

const LinkInputTooltip = ({ onSave, onCancel, currentUrl = '' }: LinkInputTooltipProps) => {
  const [url, setUrl] = useState(currentUrl);
  const t = useTranslations('DashPage.Editor.LinkInputTooltip');

  const handleSubmit = (formData: FormData) => {
    const nextUrl = String(formData.get('url') ?? '').trim();

    if (nextUrl) {
      // Ensure the URL has a protocol
      const formattedUrl =
        nextUrl.startsWith('http://') || nextUrl.startsWith('https://') ? nextUrl : `https://${nextUrl}`;
      onSave(formattedUrl);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="absolute top-full left-0 z-1000 mt-1 rounded-md border border-gray-300/50 bg-white p-2 shadow-md">
      <form
        action={handleSubmit}
        className="flex items-center gap-1"
      >
        <input
          name="url"
          type="text"
          placeholder={t('enterUrl')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-[200px] rounded border border-gray-300/50 px-2 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <div className="flex gap-0.5">
          <button
            type="submit"
            disabled={!url.trim()}
            className="flex cursor-pointer items-center justify-center rounded bg-green-50 p-1 text-green-600 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-50"
            title={t('saveLink')}
          >
            <Check size={18} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex cursor-pointer items-center justify-center rounded bg-red-50 p-1 text-red-600 transition-colors hover:bg-red-100"
            title={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default LinkInputTooltip;
