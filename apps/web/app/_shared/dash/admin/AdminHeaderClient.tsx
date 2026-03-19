'use client';

import { useTranslations } from 'next-intl';

export default function AdminHeaderClient() {
  const t = useTranslations('Contexts.Org');

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{t('adminTitle')}</h1>
      <p className="text-muted-foreground">{t('adminDescription')}</p>
    </div>
  );
}
