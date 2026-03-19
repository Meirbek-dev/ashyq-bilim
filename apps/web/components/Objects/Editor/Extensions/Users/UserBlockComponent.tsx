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
  User,
  Users,
} from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { getUser, getUserByUsername } from '@services/users/users';
import UserAvatar from '@components/Objects/UserAvatar';
import { NodeViewWrapper } from '@tiptap/react';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface UserData {
  id: number;
  user_uuid: string;
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

const AVAILABLE_ICONS = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
  'link': Link,
  'users': Users,
  'calendar': Calendar,
} as const;

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = AVAILABLE_ICONS[iconName as keyof typeof AVAILABLE_ICONS];
  if (!IconElement) return <User className="h-4 w-4 text-gray-600" />;
  return <IconElement className="h-4 w-4 text-gray-600" />;
};

const UserBlockComponent = (props: any) => {
  const t = useTranslations('DashPage.Editor.UserBlock');
  const editorState = useEditorProvider();
  const { isEditable } = editorState;
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Destructure props to avoid dependency on entire props object
  const { updateAttributes, node } = props;

  async function fetchUserById(userId: number) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUser(userId);
      if (!data) {
        throw new Error('User not found');
      }
      setUserData(data);
      setUsername(data.username);
    } catch (error: any) {
      console.error('Error fetching user by ID:', error);
      setError(error.detail || t('errorNotFound'));
      // Clear the invalid user_id from the node attributes
      updateAttributes({
        user_id: null,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (node.attrs.user_id) {
      (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const data = await getUser(node.attrs.user_id);
          if (!data) throw new Error('User not found');
          setUserData(data);
          setUsername(data.username);
        } catch (error: any) {
          console.error('Error fetching user by ID:', error);
          setError(error.detail || t('errorNotFound'));
          // Clear the invalid user_id from the node attributes
          updateAttributes({ user_id: null });
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [node.attrs.user_id, updateAttributes, t]);

  const fetchUserByUsername = async (username: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserByUsername(username);
      if (!data) {
        throw new Error('User not found');
      }
      setUserData(data);
      updateAttributes({
        user_id: data.id,
      });
    } catch (error: any) {
      console.error('Error fetching user by username:', error);
      setError(error.detail || t('errorNotFound'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameSubmit = async (formData: FormData) => {
    const submittedUsername = String(formData.get('username') ?? '').trim();

    if (!submittedUsername) return;
    await fetchUserByUsername(submittedUsername);
  };

  if (isEditable && !userData) {
    return (
      <NodeViewWrapper className="block-user">
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6">
          <form
            action={handleUsernameSubmit}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="username">{t('usernameLabel')}</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="username"
                  name="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                  }}
                  placeholder={t('usernamePlaceholder')}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('loadUser')}
                </Button>
              </div>
              {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
            </div>
          </form>
        </div>
      </NodeViewWrapper>
    );
  }

  if (isLoading) {
    return (
      <NodeViewWrapper className="block-user">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </NodeViewWrapper>
    );
  }

  if (error) {
    return (
      <NodeViewWrapper className="block-user">
        <div className="rounded-lg bg-red-50 p-4 text-red-500">{error}</div>
      </NodeViewWrapper>
    );
  }

  if (!userData) {
    return (
      <NodeViewWrapper className="block-user">
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6">
          <div className="flex items-center gap-2 text-gray-500">
            <User className="h-5 w-5" />
            <span>{t('noUserSelected')}</span>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="block-user">
      <div className="soft-shadow overflow-hidden rounded-lg bg-white">
        {/* Header with Avatar and Name */}
        <div className="relative">
          {/* Background gradient */}
          <div className="absolute inset-0 h-28 rounded-t-lg bg-linear-to-b from-gray-100/30 to-transparent" />

          {/* Content */}
          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="shrink-0">
                <div className="rounded-full">
                  <UserAvatar
                    size="xl"
                    avatar_url={
                      userData.avatar_image
                        ? getUserAvatarMediaDirectory(userData.user_uuid, userData.avatar_image)
                        : ''
                    }
                    predefined_avatar={userData.avatar_image ? undefined : 'empty'}
                    userId={userData.id}
                    showProfilePopup
                  />
                </div>
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
    </NodeViewWrapper>
  );
};

export default UserBlockComponent;
