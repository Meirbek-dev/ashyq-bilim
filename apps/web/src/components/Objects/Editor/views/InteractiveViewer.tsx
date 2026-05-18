'use client';

import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext';
import { Tiptap } from '@tiptap/react';
import { useEditorInstance } from '@components/Objects/Editor/core';
import type { ActivityRef } from '@components/Objects/Editor/core';
import AICanvaToolkit from '@components/Objects/Activities/DynamicCanva/AI/AICanvaToolkit';
import TableOfContents, { useHeadingOutline } from '@components/Objects/Activities/DynamicCanva/TableOfContents';
import { ListTree } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import '@components/Objects/Editor/styles/prosemirror.css';

interface InteractiveViewerProps {
  content: unknown;
  activity: ActivityRef;
  showDesktopTableOfContents?: boolean;
}

export function InteractiveViewer(props: InteractiveViewerProps) {
  const t = useTranslations('ActivityPage');
  const showDesktopTableOfContents = props.showDesktopTableOfContents ?? true;
  const editor = useEditorInstance({
    preset: 'interactive',
    activity: props.activity,
    content: props.content,
  });
  const headings = useHeadingOutline(editor);
  const hasToc = headings.length >= 2;

  return (
    <EditorOptionsProvider options={{ isEditable: false, mode: 'interactive' }}>
      <div
        className={cn(
          'prosemirror-interactive relative mx-auto w-full px-1 py-2 sm:px-2 xl:px-4',
          showDesktopTableOfContents && 'prosemirror-interactive--with-toc',
        )}
      >
        <div className="pointer-events-none absolute inset-0 z-[1000] [&>*]:pointer-events-auto">
          {editor ? (
            <AICanvaToolkit
              activity={props.activity}
              editor={editor}
            />
          ) : null}
        </div>
        {hasToc ? (
          <MobileTableOfContents
            editor={editor}
            title={t('onThisPage')}
          />
        ) : null}
        <div className="prosemirror-interactive-layout">
          <div className="prosemirror-interactive-layout-content">
            {editor ? (
              <Tiptap instance={editor}>
                <Tiptap.Content />
              </Tiptap>
            ) : null}
          </div>
          {hasToc && showDesktopTableOfContents ? (
            <aside
              aria-label={t('onThisPage')}
              className="prosemirror-interactive-layout-toc"
            >
              <TableOfContents editor={editor} />
            </aside>
          ) : null}
        </div>
      </div>
    </EditorOptionsProvider>
  );
}

function MobileTableOfContents({ editor, title }: { editor: ReturnType<typeof useEditorInstance>; title: string }) {
  return (
    <div className="mb-3 flex justify-end xl:hidden">
      <Sheet>
        <SheetTrigger
          render={(triggerProps) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={title}
              {...triggerProps}
            >
              <ListTree className="size-4" />
              {title}
            </Button>
          )}
        />
        <SheetContent
          side="right"
          className="w-[min(90vw,22rem)]"
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <TableOfContents editor={editor} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
