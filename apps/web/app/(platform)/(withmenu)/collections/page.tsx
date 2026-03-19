import NewCollectionButton from '@/components/Objects/Elements/Buttons/NewCollectionButton';
import TypeOfContentTitle from '@/components/Objects/Elements/Titles/TypeOfContentTitle';
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail';
import GeneralWrapper from '@/components/Objects/Elements/Wrappers/GeneralWrapper';
import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import { PermissionGuard } from '@components/Security/PermissionGuard';
import { getThumbnailMediaDirectory } from '@services/media/media';
import ProtectedText from '@components/Objects/ContentPlaceHolder';
import { getCollections } from '@services/courses/collections';
import { Actions, Resources, Scopes } from '@/types/permissions';
import { getOptionalSession } from '@/lib/get-optional-session';
import { getAbsoluteUrl } from '@services/config/config';
import { getTranslations } from 'next-intl/server';
import Link from '@components/ui/AppLink';
import type { Metadata } from 'next';

interface MetadataProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(_props: MetadataProps): Promise<Metadata> {
  const t = await getTranslations('HomePage.Collections');
  const org = await getPlatformOrganizationContextInfo();

  return {
    title: `${t('title')} - Ashyq Bilim`,
    description: `${t('collectionOfCourses', { orgName: 'Ashyq Bilim' })}`,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title: `${t('title')} - Ashyq Bilim`,
      description: `${t('collectionOfCourses', { orgName: 'Ashyq Bilim' })}`,
      type: 'website',
      images: [
        {
          url: getThumbnailMediaDirectory(org?.thumbnail_image),
          width: 800,
          height: 600,
          alt: org.name,
        },
      ],
    },
  };
}

export default async function PlatformCollectionsPage() {
  const t = await getTranslations('HomePage.Collections');
  const session = await getOptionalSession();
  const access_token = session?.tokens?.access_token;
  const org = await getPlatformOrganizationContextInfo(access_token || undefined);
  const collections = await getCollections(access_token);

  return (
    <GeneralWrapper>
      <div className="mb-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <TypeOfContentTitle
            title={t('title')}
            type="col"
          />
          <PermissionGuard
            action={Actions.CREATE}
            resource={Resources.COLLECTION}
            scope={Scopes.ORG}
            fallback={null}
          >
            <Link href={getAbsoluteUrl('/collections/new')}>
              <NewCollectionButton />
            </Link>
          </PermissionGuard>
        </div>
        <div className="grid w-full grid-cols-2 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4">
          {collections.map((collection: any) => (
            <div
              key={collection.collection_uuid}
              className="p-3"
            >
              <CollectionThumbnail collection={collection} />
            </div>
          ))}
          {collections.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-8">
              <div className="text-center">
                <h1 className="mb-2 text-xl font-bold text-gray-600">{t('noContent')}</h1>
                <p className="text-base text-gray-400">
                  <ProtectedText
                    text={t('noContentUserAdmin')}
                    action={Actions.CREATE}
                    resource={Resources.COLLECTION}
                    scope={Scopes.ORG}
                  />
                </p>
                <div className="mt-4 flex justify-center">
                  <PermissionGuard
                    action={Actions.CREATE}
                    resource={Resources.COLLECTION}
                    scope={Scopes.ORG}
                    fallback={null}
                  >
                    <Link href={getAbsoluteUrl('/collections/new')}>
                      <NewCollectionButton />
                    </Link>
                  </PermissionGuard>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </GeneralWrapper>
  );
}
