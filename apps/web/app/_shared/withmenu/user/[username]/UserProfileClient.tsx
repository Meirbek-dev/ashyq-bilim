'use client';

import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Globe,
  GraduationCap,
  Laptop2,
  Lightbulb,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import CourseThumbnail from '@components/Objects/Thumbnails/CourseThumbnail';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getUserAvatarMediaDirectory } from '@services/media/media';
import { getCoursesByUser } from '@services/users/users';
import UserAvatar from '@components/Objects/UserAvatar';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { FC } from 'react';
import Image from 'next/image';

interface UserProfileClientProps {
  userData: any;
  profile: any;
}

const ICON_MAP = {
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'map-pin': MapPin,
  'building-2': Building2,
  'speciality': Lightbulb,
  'globe': Globe,
  'laptop-2': Laptop2,
  'award': Award,
  'book-open': BookOpen,
  'link': LinkIcon,
  'users': Users,
  'calendar': Calendar,
} as const;

const IconComponent = ({ iconName }: { iconName: string }) => {
  const IconElement = ICON_MAP[iconName as keyof typeof ICON_MAP];
  if (!IconElement) return null;
  return <IconElement className="h-4 w-4 text-gray-600" />;
};

const ImageModal: FC<{
  image: { url: string; caption?: string };
  onClose: () => void;
}> = ({ image, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-4xl">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white transition-colors hover:text-gray-300"
        >
          <X className="h-6 w-6" />
        </button>
        <Image
          src={image.url}
          alt={image.caption || ''}
          width={800}
          height={600}
          className="h-auto w-full rounded-lg"
        />
        {image.caption ? <p className="mt-4 text-center text-lg text-white">{image.caption}</p> : null}
      </div>
    </div>
  );
};

const UserProfileClient = ({ userData, profile }: UserProfileClientProps) => {
  const session = usePlatformSession();
  const access_token = session?.data?.tokens?.access_token;
  const t = useTranslations('UserProfilePage');
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    caption?: string;
  } | null>(null);
  const [userCourses, setUserCourses] = useState<any[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchUserCourses = async () => {
      if (userData.id && access_token) {
        try {
          setIsLoadingCourses(true);
          const coursesData = await getCoursesByUser(userData.id, access_token);
          if (coursesData.data) {
            setUserCourses(coursesData.data);
          }
        } catch (error) {
          console.error(t('fetchError'), error);
          setError(true);
        } finally {
          setIsLoadingCourses(false);
        }
      }
    };

    fetchUserCourses();
  }, [userData.id, access_token, t]);

  return (
    <div className="container mx-auto py-8">
      {/* Banner */}
      <div className="relative mb-0 h-48 w-full overflow-hidden rounded-t-xl bg-gray-100">
        {/* Optional banner content */}
      </div>
      {/* Profile Content */}
      <div className="soft-shadow relative rounded-b-xl bg-white p-8">
        {/* Avatar Positioned on the banner */}
        <div className="absolute -top-24 left-12">
          <div className="overflow-hidden rounded-full border-4 border-white shadow-lg">
            <UserAvatar
              size="3xl"
              avatar_url={
                userData.avatar_image ? getUserAvatarMediaDirectory(userData.user_uuid, userData.avatar_image) : ''
              }
              {...(!userData.avatar_image && { predefined_avatar: 'empty' })}
              userId={userData.id}
              showProfilePopup
            />
          </div>
        </div>

        {/* Affiliation Logos */}
        <div className="absolute -top-12 right-8 flex items-center gap-4">
          {profile.sections?.map(
            (section: any) =>
              section.type === 'affiliation' &&
              section.affiliations?.map(
                (affiliation: any, index: number) =>
                  affiliation.logoUrl && (
                    <div
                      key={index}
                      className="rounded-lg border-2 border-white bg-white p-2 shadow-lg"
                    >
                      <Image
                        src={affiliation.logoUrl}
                        alt={affiliation.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 object-contain"
                        title={affiliation.name}
                      />
                    </div>
                  ),
              ),
          )}
        </div>

        {/* Profile Content with right padding to avoid overlap */}
        <div className="mt-20 md:mt-14">
          <div className="flex flex-col gap-12 md:flex-row">
            {/* Left column with details - aligned with avatar */}
            <div className="w-full pl-2 md:w-1/6">
              {/* Name */}
              <h1 className="mb-8 text-[32px] font-bold">
                {[userData.first_name, userData.middle_name, userData.last_name].filter(Boolean).join(' ')}
              </h1>

              {/* Details */}
              <div className="flex flex-col space-y-3">
                {userData.details
                  ? Object.values(userData.details).map((detail: any) => (
                      <div
                        key={detail.id}
                        className="flex items-center gap-4"
                      >
                        <div className="shrink-0">
                          <IconComponent iconName={detail.icon} />
                        </div>
                        <span className="text-[15px] font-medium text-gray-700">{detail.text}</span>
                      </div>
                    ))
                  : null}
              </div>
            </div>

            {/* Right column with about and related content */}
            <div className="w-full md:w-4/6">
              <div className="mb-8">
                <h2 className="mb-4 text-xl font-semibold">{t('aboutTitle')}</h2>
                {userData.bio ? (
                  <p className="text-gray-700">{userData.bio}</p>
                ) : (
                  <p className="text-gray-500 italic">{t('noBiography')}</p>
                )}
              </div>

              {/* Profile sections from profile builder */}
              {profile.sections && profile.sections.length > 0 ? (
                <div>
                  {profile.sections.map((section: any, index: number) => (
                    <div
                      key={index}
                      className="mb-8"
                    >
                      <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>

                      {/* Add Image Gallery section */}
                      {section.type === 'image-gallery' && (
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                          {section.images.map((image: any, imageIndex: number) => (
                            <div
                              key={imageIndex}
                              className="group relative cursor-pointer"
                              onClick={() => {
                                setSelectedImage(image);
                              }}
                            >
                              <Image
                                src={image.url}
                                alt={image.caption || ''}
                                width={300}
                                height={192}
                                className="h-48 w-full rounded-lg object-cover"
                              />
                              {image.caption ? (
                                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  <p className="text-center text-sm text-white">{image.caption}</p>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'text' && <div className="prose max-w-none">{section.content}</div>}

                      {section.type === 'links' && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {section.links.map((link: any, linkIndex: number) => (
                            <a
                              key={linkIndex}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                            >
                              <LinkIcon className="h-4 w-4" />
                              <span>{link.title}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {section.type === 'skills' && (
                        <div className="flex flex-wrap gap-2">
                          {section.skills.map((skill: any, skillIndex: number) => (
                            <span
                              key={skillIndex}
                              className="rounded-full bg-gray-100 px-3 py-1 text-sm"
                            >
                              {skill.name}
                              {skill.level ? ` • ${skill.level}` : null}
                            </span>
                          ))}
                        </div>
                      )}

                      {section.type === 'experience' && (
                        <div className="space-y-4">
                          {section.experiences.map((exp: any, expIndex: number) => (
                            <div
                              key={expIndex}
                              className="border-l-2 border-gray-200 pl-4"
                            >
                              <h3 className="font-medium">{exp.title}</h3>
                              <p className="text-gray-600">{exp.organization}</p>
                              <p className="text-sm text-gray-500">
                                {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                              </p>
                              {exp.description ? <p className="mt-2 text-gray-700">{exp.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'education' && (
                        <div className="space-y-4">
                          {section.education.map((edu: any, eduIndex: number) => (
                            <div
                              key={eduIndex}
                              className="border-l-2 border-gray-200 pl-4"
                            >
                              <h3 className="font-medium">{edu.institution}</h3>
                              <p className="text-gray-600">
                                {edu.degree} {t('in')} {edu.field}
                              </p>
                              <p className="text-sm text-gray-500">
                                {edu.startDate} - {edu.current ? 'Present' : edu.endDate}
                              </p>
                              {edu.description ? <p className="mt-2 text-gray-700">{edu.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'affiliation' && (
                        <div className="space-y-4">
                          {section.affiliations.map((affiliation: any, affIndex: number) => (
                            <div
                              key={affIndex}
                              className="border-l-2 border-gray-200 pl-4"
                            >
                              <div className="flex items-start gap-4">
                                {affiliation.logoUrl ? (
                                  <Image
                                    src={affiliation.logoUrl}
                                    alt={affiliation.name}
                                    width={48}
                                    height={48}
                                    className="h-12 w-12 object-contain"
                                  />
                                ) : null}
                                <div>
                                  <h3 className="font-medium">{affiliation.name}</h3>
                                  {affiliation.description ? (
                                    <p className="mt-2 text-gray-700">{affiliation.description}</p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {section.type === 'courses' && (
                        <div>
                          {isLoadingCourses ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                          ) : userCourses.length > 0 ? (
                            <div className="grid w-full grid-cols-1 gap-6 pb-8 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                              {userCourses.map((course) => (
                                <div
                                  key={course.id}
                                  className="mx-auto w-full max-w-[300px]"
                                >
                                  <CourseThumbnail course={course} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-8 text-center text-gray-500">{t('courseSection.noCoursesFound')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {error ? <div className="text-red-500">{t('courseSection.errorLoadingCourses')}</div> : null}
            </div>
          </div>
        </div>
      </div>
      {/* Image Modal */}
      {selectedImage ? (
        <ImageModal
          image={selectedImage}
          onClose={() => {
            setSelectedImage(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default UserProfileClient;
