'use client';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@components/ui/form';
import { SiFacebook, SiInstagram, SiTiktok, SiX, SiYoutube } from '@icons-pack/react-simple-icons';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { revalidateTags } from '@services/utils/ts/requests';
import { updatePlatform } from '@/services/settings/platform';
import { getAPIUrl } from '@services/config/config';
import { Plus, X as XIcon } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';

interface SocialMediaData {
  socials: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
  links: Record<string, string>;
}

export default function EditSocials() {
  const session = usePlatformSession() as any;
  const access_token = session?.data?.tokens?.access_token;
  const org = usePlatform() as any;
  const t = useTranslations('DashPage.OrgSettings.Socials');

  const defaultValues = {
    socials: org?.socials || {},
    links: org?.links || {},
  };

  const form = useForm<SocialMediaData>({
    defaultValues,
  });

  const links = form.watch('links');
  const [isPending, startTransition] = useTransition();

  const updateOrg = async (values: SocialMediaData) => {
    const loadingToast = toast.loading(t('updatingOrg'));
    try {
      await updatePlatform(values, access_token);
      await revalidateTags(['organizations']);
      mutate(`${getAPIUrl()}orgs/platform`);
      toast.success(t('orgUpdatedSuccess'), { id: loadingToast });
    } catch {
      toast.error(t('orgUpdateFailed'), { id: loadingToast });
    }
  };

  const handleLinkChange = (oldKey: string, newKey: string, value: string) => {
    const currentLinks = form.getValues('links');
    const newLinks = { ...currentLinks };
    if (oldKey !== newKey) {
      delete newLinks[oldKey];
    }
    newLinks[newKey] = value;
    form.setValue('links', newLinks);
  };

  const removeLink = (key: string) => {
    const currentLinks = form.getValues('links');
    const newLinks = { ...currentLinks };
    delete newLinks[key];
    form.setValue('links', newLinks);
  };

  const addNewLink = () => {
    const currentLinks = form.getValues('links');
    const newLinks = { ...currentLinks };
    newLinks[`${t('Form.newCustomLinkDefaultLabel')} ${Object.keys(newLinks).length + 1}`] = '';
    form.setValue('links', newLinks);
  };

  const linksEntries = Object.entries(links || {});

  const socialFields = [
    {
      name: 'socials.instagram' as const,
      placeholder: t('Form.instagramPlaceholder'),
      icon: (
        <SiInstagram
          size={16}
          color="#E4405F"
        />
      ),
      bgColor: 'bg-[#E4405F]/10',
    },
    {
      name: 'socials.facebook' as const,
      placeholder: t('Form.facebookPlaceholder'),
      icon: (
        <SiFacebook
          size={16}
          color="#1877F2"
        />
      ),
      bgColor: 'bg-[#1877F2]/10',
    },
    {
      name: 'socials.youtube' as const,
      placeholder: t('Form.youtubePlaceholder'),
      icon: (
        <SiYoutube
          size={16}
          color="#FF0000"
        />
      ),
      bgColor: 'bg-[#FF0000]/10',
    },
    {
      name: 'socials.tiktok' as const,
      placeholder: t('Form.tiktokPlaceholder'),
      icon: <SiTiktok size={16} />,
      bgColor: 'bg-[#82878a]/10',
    },
    {
      name: 'socials.twitter' as const,
      placeholder: t('Form.xPlaceholder'),
      icon: <SiX size={16} />,
      bgColor: 'bg-[#707577]/10',
    },
  ];

  return (
    <div className="soft-shadow mx-0 rounded-xl bg-white sm:mx-10">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            startTransition(() => {
              void updateOrg(values);
            }),
          )}
        >
          <div className="flex flex-col gap-0">
            <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-muted px-5 py-3">
              <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
              <h2 className="text-base text-muted-foreground">{t('description')}</h2>
            </div>

            <div className="mx-5 my-5 mt-0 flex flex-col lg:flex-row lg:space-x-8">
              <div className="w-full space-y-6">
                <div>
                  <FormLabel className="text-lg font-semibold">{t('socialLinksTitle')}</FormLabel>
                  <div className="soft-shadow mt-2 space-y-3 rounded-lg bg-muted/50 p-4">
                    <div className="grid gap-3">
                      {socialFields.map((field) => (
                        <FormField
                          key={field.name}
                          control={form.control}
                          name={field.name}
                          render={({ field: formField }) => (
                            <FormItem>
                              <div className="flex items-center space-x-3">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${field.bgColor}`}>
                                  {field.icon}
                                </div>
                                <FormControl>
                                  <Input
                                    placeholder={field.placeholder}
                                    className="h-9 bg-white"
                                    {...formField}
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-6">
                <div>
                  <FormLabel className="text-lg font-semibold">{t('customLinksTitle')}</FormLabel>
                  <div className="soft-shadow mt-2 space-y-3 rounded-lg bg-muted/50 p-4">
                    {linksEntries.map(([linkKey, linkValue], index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                          {index + 1}
                        </div>
                        <div className="flex flex-1 gap-2">
                          <Input
                            placeholder={t('Form.customLinkLabelPlaceholder')}
                            value={linkKey}
                            className="h-9 w-1/3 bg-white"
                            onChange={(e) => {
                              handleLinkChange(linkKey, e.target.value, linkValue);
                            }}
                          />
                          <Input
                            placeholder={t('Form.customLinkUrlPlaceholder')}
                            value={linkValue}
                            className="h-9 flex-1 bg-white"
                            onChange={(e) => {
                              handleLinkChange(linkKey, linkKey, e.target.value);
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              removeLink(linkKey);
                            }}
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {linksEntries.length < 3 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={addNewLink}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('Form.addCustomLinkButton')}
                      </Button>
                    )}

                    <p className="mt-2 text-xs text-muted-foreground">{t('Form.customLinkInfo', { count: 3 })}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-5 mt-3 mb-5 flex flex-row-reverse">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || isPending}
              >
                {form.formState.isSubmitting || isPending ? t('Form.savingButton') : t('Form.saveButton')}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
