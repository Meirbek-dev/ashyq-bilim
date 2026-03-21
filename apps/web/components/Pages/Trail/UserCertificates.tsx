'use client';

import { Award, Building, Calendar, ExternalLink, Hash } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAPIUrl, getAbsoluteUrl } from '@services/config/config';
import { useFormatter, useTranslations } from 'next-intl';
import { swrFetcher } from '@services/utils/ts/requests';
import Link from '@components/ui/AppLink';
import type React from 'react';
import useSWR from 'swr';

const UserCertificates: React.FC = () => {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const format = useFormatter();
  const t = useTranslations('Certificates.UserCertificates');

  const {
    data: certificates,
    error,
    isLoading,
  } = useSWR(access_token ? `${getAPIUrl()}certifications/user/all` : null, (url) => swrFetcher(url, access_token));

  if (isLoading) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center space-x-3">
          <Award className="h-6 w-6 text-yellow-500" />
          <h2 className="text-xl font-semibold text-gray-900">{t('myCertificates')}</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-gray-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center space-x-3">
          <Award className="h-6 w-6 text-yellow-500" />
          <h2 className="text-xl font-semibold text-gray-900">{t('myCertificates')}</h2>
        </div>
        <div className="py-8 text-center">
          <p className="text-gray-500">{t('failedToLoadCertificates')}</p>
        </div>
      </div>
    );
  }

  // Handle the actual API response structure - certificates are returned as an array directly
  const certificatesData = Array.isArray(certificates) ? certificates : certificates?.data || [];

  if (!certificatesData || certificatesData.length === 0) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center space-x-3">
          <Award className="h-6 w-6 text-yellow-500" />
          <h2 className="text-xl font-semibold text-gray-900">{t('myCertificates')}</h2>
        </div>
        <div className="py-8 text-center">
          <Award className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">{t('noCertificatesEarned')}</p>
          <p className="mt-1 text-sm text-gray-400">{t('completeCoursesToEarn')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center space-x-3">
        <Award className="h-6 w-6 text-yellow-500" />
        <h2 className="text-xl font-semibold text-gray-900">{t('myCertificates')}</h2>
        <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
          {certificatesData.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {certificatesData.map((certificate: any) => {
          const verificationLink = getAbsoluteUrl(
            `/certificates/${certificate.certificate_user.user_certification_uuid}/verify`,
          );
          const awardedDate = format.dateTime(new Date(certificate.certificate_user.created_at), {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            // Use Almaty timezone to avoid ENVIRONMENT_FALLBACK errors and match the platform locale
            timeZone: 'Asia/Almaty',
          });

          return (
            <div
              key={certificate.certificate_user.user_certification_uuid}
              className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Award className="h-4 w-4 text-yellow-500" />
                  <h3 className="truncate text-sm font-semibold text-gray-900">
                    {certificate.certification.config.certification_name}
                  </h3>
                </div>

                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Building className="h-3 w-3" />
                    <span className="truncate">{certificate.course.name}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {t('awardedOn')} {awardedDate}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Hash className="h-3 w-3" />
                    <span className="truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs">
                      {certificate.certificate_user.user_certification_uuid}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                  <div className="text-xs text-gray-500 capitalize">
                    {certificate.certification.config.certification_type.replace('_', ' ')}
                  </div>
                  <Link
                    prefetch={false}
                    href={verificationLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <span>{t('verifyCertificate')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UserCertificates;
