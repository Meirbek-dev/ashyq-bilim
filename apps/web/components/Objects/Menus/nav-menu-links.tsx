import { BookCopy, Signpost, SquareLibrary } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { getTranslations } from 'next-intl/server';
import Link from '@components/ui/AppLink';
import { auth } from '@/auth';

const MenuLinks = async () => {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);

  return (
    <div className="pl-1">
      <ul className="flex space-x-5">
        <LinkItem
          link="/courses"
          type="courses"
        />
        <LinkItem
          link="/collections"
          type="collections"
        />
        {isAuthenticated && (
          <LinkItem
            link="/trail"
            type="trail"
          />
        )}
      </ul>
    </div>
  );
};
const LinkItem = async (props: any) => {
  const t = await getTranslations('Components.OrgMenuLinks');
  const { link } = props;
  return (
    <Link
      prefetch={false}
      href={getAbsoluteUrl(link)}
    >
      <li className="flex items-center space-x-2 font-medium text-[#909192]">
        {props.type === 'courses' && (
          <>
            <BookCopy size={20} /> <span>{t('courses')}</span>
          </>
        )}

        {props.type === 'collections' && (
          <>
            <SquareLibrary size={20} /> <span>{t('collections')}</span>
          </>
        )}

        {props.type === 'trail' && (
          <>
            <Signpost size={20} /> <span>{t('trail')}</span>
          </>
        )}
      </li>
    </Link>
  );
};
export default MenuLinks;
