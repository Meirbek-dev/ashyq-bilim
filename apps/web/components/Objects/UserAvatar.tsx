'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@components/ui/avatar';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { getUserByUsername } from '@services/users/users';
import { getAbsoluteUrl } from '@services/config/config';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

import UserProfilePopup from './UserProfilePopup';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type AvatarVariant = 'default' | 'outline' | 'ghost';

interface UserAvatarProps {
  size?: AvatarSize;
  variant?: AvatarVariant;
  avatar_url?: string;
  use_with_session?: boolean;
  predefined_avatar?: 'ai' | 'empty';
  showProfilePopup?: boolean;
  userId?: number;
  username?: string;
  className?: string;
  fallbackText?: string;
}

const sizeVariants = {
  'xs': 'h-6 w-6 text-[10px]',
  'sm': 'h-8 w-8 text-xs',
  'md': 'h-10 w-10 text-sm',
  'lg': 'h-12 w-12 text-base',
  'xl': 'h-16 w-16 text-lg',
  '2xl': 'h-20 w-20 text-xl',
  '3xl': 'h-32 w-32 text-2xl',
};

const variantStyles = {
  default: 'border-2 border-background shadow-md',
  outline: 'border-2 border-border',
  ghost: 'border-0',
};

const UserAvatar = (props: UserAvatarProps) => {
  const t = useTranslations('Components.UserAvatar');
  const session = usePlatformSession() as any;
  const params = useParams();
  const [userData, setUserData] = useState<any>(null);

  const {
    size = 'md',
    variant = 'default',
    avatar_url,
    predefined_avatar,
    showProfilePopup,
    userId,
    username,
    className,
    fallbackText,
  } = props;

  useEffect(() => {
    const fetchUserByUsername = async () => {
      if (username) {
        try {
          const data = await getUserByUsername(username);
          setUserData(data);
        } catch (error) {
          console.error('Error fetching user by username:', error);
        }
      }
    };

    fetchUserByUsername();
  }, [username]);

  const isExternalUrl = (url: string): boolean => {
    return url.startsWith('http://') || url.startsWith('https://');
  };

  const extractExternalUrl = (url: string): string | null => {
    // Check if the URL contains an embedded external URL
    const matches = /avatars\/(https?:\/\/[^/]+.*$)/.exec(url);
    if (matches?.[1]) {
      return matches[1];
    }
    return null;
  };

  const getAvatarUrl = (): string => {
    // If predefined avatar is specified
    if (predefined_avatar) {
      const avatarType = predefined_avatar === 'ai' ? 'platform_logo.svg' : 'empty_avatar.webp';
      return getAbsoluteUrl(`/${avatarType}`);
    }

    // If avatar_url prop is provided
    if (avatar_url) {
      // Check if it's a malformed URL (external URL processed through getUserAvatarMediaDirectory)
      const extractedUrl = extractExternalUrl(avatar_url);
      if (extractedUrl) {
        return extractedUrl;
      }
      // If it's a direct external URL
      if (isExternalUrl(avatar_url)) {
        return avatar_url;
      }
      // Otherwise use as is
      return avatar_url;
    }

    // If we have user data from username fetch
    if (userData?.avatar_image) {
      const avatarUrl = userData.avatar_image;
      // If it's an external URL (e.g., from Google, Facebook, etc.), use it directly
      if (isExternalUrl(avatarUrl)) {
        return avatarUrl;
      }
      // Otherwise, get the local avatar URL
      return getUserAvatarMediaDirectory(userData.user_uuid, avatarUrl);
    }

    // If username was provided but no user data found, don't fall back to session
    // This prevents showing the wrong user's avatar for usernames that don't exist
    if (username) {
      return getAbsoluteUrl('/empty_avatar.webp');
    }

    // If user has an avatar in session (only if session exists and no username was provided)
    if (session?.data?.user?.avatar_image) {
      const avatarUrl = session.data.user.avatar_image;
      // If it's an external URL (e.g., from Google, Facebook, etc.), use it directly
      if (isExternalUrl(avatarUrl)) {
        return avatarUrl;
      }
      // Otherwise, get the local avatar URL
      return getUserAvatarMediaDirectory(session.data.user.user_uuid, avatarUrl);
    }

    // Fallback to empty avatar
    return getAbsoluteUrl('/empty_avatar.webp');
  };

  const getFallbackText = (): string => {
    if (fallbackText) return fallbackText;

    // Try to get initials from userData
    if (userData?.first_name && userData?.last_name) {
      return `${userData.first_name[0]}${userData.last_name[0]}`.toUpperCase();
    }

    // If we have a username prop, use it for fallback regardless of fetch status
    if (username && username.length > 0) {
      return username.charAt(0).toUpperCase();
    }

    // Try to get initials from session
    if (session?.data?.user?.first_name && session?.data?.user?.last_name) {
      return `${session.data.user.first_name[0]}${session.data.user.last_name[0]}`.toUpperCase();
    }

    // Try to get first letter from username
    if (userData?.username) {
      return userData.username[0].toUpperCase();
    }

    if (session?.data?.user?.username) {
      return session.data.user.username[0].toUpperCase();
    }

    return '?';
  };

  const avatarElement = (
    <Avatar className={cn(sizeVariants[size], variantStyles[variant], 'bg-background', className)}>
      <AvatarImage
        src={getAvatarUrl()}
        alt={t('altText')}
        className="bg-background"
      />
      <AvatarFallback className="bg-muted text-muted-foreground">
        {predefined_avatar === 'ai' ? <User className="h-[60%] w-[60%]" /> : getFallbackText()}
      </AvatarFallback>
    </Avatar>
  );

  if (showProfilePopup && (userId || userData?.id)) {
    return <UserProfilePopup userId={userId || userData?.id}>{avatarElement}</UserProfilePopup>;
  }

  return avatarElement;
};

export default UserAvatar;
