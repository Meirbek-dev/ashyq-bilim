'use client';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { BarLoader } from '@components/Objects/Loaders/BarLoader';
import { valibotResolver } from '@hookform/resolvers/valibot';
import { constructAcceptValue } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
import * as v from 'valibot';

const SUPPORTED_FILES = constructAcceptValue(['pdf']);

const createValidationSchema = (t: (key: string) => string) =>
  v.object({
    name: v.pipe(v.string(), v.minLength(1, t('documentNameRequired'))),
    file: v.instance(File, t('pdfFileRequired')),
  });

interface FormValues {
  name: string;
  file: File;
}

const DocumentPdfModal = ({ submitFileActivity, chapterId, course }: any) => {
  const validationT = useTranslations('Validation');
  const t = useTranslations('Components.DocumentPdfModal');
  const validationSchema = createValidationSchema(validationT);

  const form = useForm<FormValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      name: '',
      file: undefined,
    },
  });

  const [isPending, startTransition] = useTransition();

  const onSubmit = (values: FormValues) => {
    startTransition(() => {
      void (async () => {
        await submitFileActivity(
          values.file,
          'documentpdf',
          {
            name: values.name,
            chapter_id: chapterId,
            activity_type: 'TYPE_DOCUMENT',
            activity_sub_type: 'SUBTYPE_DOCUMENT_PDF',
            published_version: 1,
            version: 1,
            course_id: course.id,
          },
          chapterId,
        );
      })();
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pdfDocumentName')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="file"
          render={({ field: { onChange, value, ...field } }) => (
            <FormItem>
              <FormLabel>{t('pdfDocumentFile')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <input
                    {...field}
                    type="file"
                    accept={SUPPORTED_FILES}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onChange(file);
                      }
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t('ariaLabel')}
                  />
                  <div className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => {}}
                    >
                      {t('selectFile')}
                    </Button>
                    <span className="text-muted-foreground">{value ? value.name : t('noFileSelected')}</span>
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="mt-6 flex justify-end">
          <Button
            type="submit"
            className="mt-2.5"
            disabled={isPending || form.formState.isSubmitting}
          >
            {isPending || form.formState.isSubmitting ? (
              <BarLoader
                cssOverride={{ borderRadius: 60 }}
                width={60}
                color="#ffffff"
              />
            ) : (
              t('createActivity')
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default DocumentPdfModal;
