'use client';
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Globe,
  GraduationCap,
  Laptop2,
  Lightbulb,
  Link,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getUser } from '@services/users/users';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface UserProfilePopupProps {
  children: ReactNode;
  userId: number;
}

interface UserData {
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  bio?: string;
  avatar_image?: string;
  details?: Record<
    string,
    {
      id: string;
      label: string;
      icon: string;
      text: string;
    }
  >;
}

const ICON_MAP = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'link': Link,
  'users': Users,
  'calendar': Calendar,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
} as const;

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = ICON_MAP[iconName as keyof typeof ICON_MAP];
  if (!IconElement) return null;
  return <IconElement className="h-4 w-4 text-gray-500" />;
};

const UserProfilePopup = ({ children, userId }: UserProfilePopupProps) => {
  const t = useTranslations('Components.UserProfilePopup');
  const session = usePlatformSession();
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchOnOpen = useCallback(
    async (open: boolean) => {
      if (!open || hasFetchedRef.current || !userId) return;
      hasFetchedRef.current = true;

      const token = session?.data?.tokens?.access_token;
      setIsLoading(true);
      setError(null);

      try {
        const data = await getUser(userId, token);
        setUserData(data);
      } catch (error) {
        setError(t('loadingError'));
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [userId, session?.data?.tokens?.access_token, t],
  );

  return (
    <HoverCard onOpenChange={fetchOnOpen}>
      <HoverCardTrigger render={<span />}>{children}</HoverCardTrigger>
      <HoverCardContent className="soft-shadow w-auto max-w-196 min-w-96 bg-white/95 p-0 backdrop-blur-md">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-500">{error}</div>
        ) : userData ? (
          <div>
            {/* Header with Avatar and Name */}
            <div className="relative">
              {/* Background gradient */}
              <div className="absolute inset-0 h-28 rounded-t-lg bg-linear-to-b from-gray-100/30 to-transparent" />

              {/* Content */}
              <div className="relative px-5 pt-5 pb-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="shrink-0">
                    <div className="rounded-full">{children}</div>
                  </div>

                  {/* Name, Bio, and Button */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4 className="truncate font-semibold text-gray-900">
                          {[userData.first_name, userData.middle_name, userData.last_name].filter(Boolean).join(' ')}
                        </h4>
                        {userData.username ? (
                          <Badge
                            variant="outline"
                            className="truncate px-2 text-xs font-normal text-gray-500"
                          >
                            @{userData.username}
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-gray-600 hover:text-gray-900"
                        onClick={() => userData.username && router.push(`/user/${userData.username}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    {userData.bio ? (
                      <p className="mt-1.5 line-clamp-4 text-sm leading-normal text-gray-500">{userData.bio}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            {userData.details && Object.values(userData.details).length > 0 ? (
              <div className="space-y-2.5 border-t border-gray-100 px-5 pt-3.5 pb-4">
                {Object.values(userData.details).map((detail) => (
                  <div
                    key={detail.id}
                    className="flex items-center gap-2.5"
                  >
                    <IconComponent iconName={detail.icon} />
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500">{detail.label}</span>
                      <span className="text-sm text-gray-700">{detail.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserProfilePopup;
