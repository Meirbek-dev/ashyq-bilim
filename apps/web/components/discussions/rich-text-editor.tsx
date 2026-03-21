'use client';

import {
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Undo,
  Upload,
  YoutubeIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useEffect, useState, useTransition } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Youtube from '@tiptap/extension-youtube';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = '',
  className = '',
  minHeight = '150px',
}: RichTextEditorProps) {
  const t = useTranslations('RichTextEditor');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc list-outside ml-4 space-y-1',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal list-outside ml-4 space-y-1',
          },
        },
        listItem: {
          HTMLAttributes: {
            class: 'ml-0',
          },
        },
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
          HTMLAttributes: {
            class: 'font-semibold text-gray-900 mt-4 mb-2',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-gray-300 pl-4 italic',
          },
        },
        code: {
          HTMLAttributes: {
            class: 'bg-gray-100 px-1 py-0.5 rounded text-sm font-mono',
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-gray-100 p-3 rounded-md overflow-x-auto',
          },
        },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 hover:text-blue-800 underline',
          },
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
      Youtube.configure({
        controls: true,
        modestBranding: true,
        HTMLAttributes: {
          class: 'w-full aspect-video rounded-lg',
        },
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none p-3',
          'overflow-wrap-anywhere break-words word-break-break-word',
          'prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:mt-4 prose-headings:mb-2',
          'prose-p:text-gray-700 prose-p:leading-relaxed prose-p:break-words',
          'prose-strong:text-gray-900 prose-em:text-gray-700',
          'prose-code:text-gray-900 prose-code:bg-gray-100 prose-code:break-all',
          'prose-pre:bg-gray-100 prose-pre:text-gray-900 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap',
          'prose-blockquote:text-gray-700 prose-blockquote:border-gray-300',
          'prose-ul:text-gray-700 prose-ul:list-disc prose-ul:list-outside prose-ul:ml-4',
          'prose-ol:text-gray-700 prose-ol:list-decimal prose-ol:list-outside prose-ol:ml-4',
          'prose-li:text-gray-700 prose-li:ml-0 prose-li:break-words',
          'prose-a:break-all',
          className,
        ),
        style: `min-height: ${minHeight}`,
      },
    },
  });
  const [isPending, startTransition] = useTransition();

  // Sync content prop changes with editor
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  const addLink = () => {
    if (!(editor && linkUrl)) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (selectedText) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkUrl}</a>`).run();
    }

    setLinkUrl('');
    setIsLinkDialogOpen(false);
  };

  const addImage = () => {
    if (!(editor && imageUrl)) return;

    editor.chain().focus().setImage({ src: imageUrl, alt: 'Uploaded image' }).run();

    setImageUrl('');
    setIsImageDialogOpen(false);
  };

  const addVideo = () => {
    if (!(editor && videoUrl)) return;

    // Extract YouTube video ID from URL
    const youtubeRegex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[&?]v=)|youtu\.be\/)([^\s"&/?]{11})/;
    const match = youtubeRegex.exec(videoUrl);

    if (match) {
      editor.chain().focus().setYoutubeVideo({ src: videoUrl }).run();
    } else {
      // For other video URLs, insert as a link
      editor.chain().focus().insertContent(`<a href="${videoUrl}" target="_blank">${videoUrl}</a>`).run();
    }

    setVideoUrl('');
    setIsVideoDialogOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!(file && editor)) return;

    startTransition(() => setIsUploading(true));

    try {
      // Create a temporary URL for the file
      const tempUrl = URL.createObjectURL(file);

      if (file.type.startsWith('image/')) {
        editor.chain().focus().setImage({ src: tempUrl, alt: file.name }).run();
      } else {
        // For non-image files, insert as a link
        editor.chain().focus().insertContent(`<a href="${tempUrl}" target="_blank">${file.name}</a>`).run();
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      startTransition(() => setIsUploading(false));
      // Clear the input
      e.target.value = '';
    }
  };

  if (!editor) {
    return null;
  }

  // TipTap v3 doesn't expose extension commands on ChainedCommands without generic editor typing

  const ed = editor as any;

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-gray-50 p-2">
        {/* Text formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleBold().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('bold') && 'bg-gray-200')}
        >
          <Bold size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleItalic().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('italic') && 'bg-gray-200')}
        >
          <Italic size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleCode().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('code') && 'bg-gray-200')}
        >
          <Code size={16} />
        </Button>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleBulletList().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('bulletList') && 'bg-gray-200')}
        >
          <List size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleOrderedList().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('orderedList') && 'bg-gray-200')}
        >
          <ListOrdered size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().toggleBlockquote().run()}
          className={cn('h-8 w-8 p-0', editor.isActive('blockquote') && 'bg-gray-200')}
        >
          <Quote size={16} />
        </Button>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn('h-8 px-2 text-sm', editor.isActive('heading', { level: 2 }) && 'bg-gray-200')}
        >
          H2
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={cn('h-8 px-2 text-sm', editor.isActive('heading', { level: 3 }) && 'bg-gray-200')}
        >
          H3
        </Button>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        {/* Media */}
        <Dialog
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <LinkIcon size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addLink')}</DialogTitle>
              <DialogDescription>{t('enterUrlToLink')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="link-url">{t('url')}</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                }}
                placeholder={t('urlPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsLinkDialogOpen(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addLink}
              >
                {t('addLink')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isImageDialogOpen}
          onOpenChange={setIsImageDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <ImageIcon size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addImage')}</DialogTitle>
              <DialogDescription>{t('enterImageUrl')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="image-url">{t('imageUrl')}</Label>
              <Input
                id="image-url"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                }}
                placeholder={t('imagePlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsImageDialogOpen(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addImage}
              >
                {t('addImage')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isVideoDialogOpen}
          onOpenChange={setIsVideoDialogOpen}
        >
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              />
            }
          >
            <YoutubeIcon size={16} />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('addVideo')}</DialogTitle>
              <DialogDescription>{t('enterVideoUrl')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="video-url">{t('videoUrl')}</Label>
              <Input
                id="video-url"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                }}
                placeholder={t('videoPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsVideoDialogOpen(false);
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={addVideo}
              >
                {t('addVideo')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Upload */}
        <div className="hover:bg-accent relative rounded-md">
          <input
            type="file"
            id="file-upload"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={handleFileUpload}
            accept="image/*,video/*"
            disabled={isUploading || isPending}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={isUploading || isPending}
            title={t('uploadFile')}
          >
            <Upload size={16} />
          </Button>
        </div>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().undo().run()}
          disabled={!ed.can().undo()}
          className="h-8 w-8 p-0"
        >
          <Undo size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => ed.chain().focus().redo().run()}
          disabled={!ed.can().redo()}
          className="h-8 w-8 p-0"
        >
          <Redo size={16} />
        </Button>
      </div>

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className="prose-editor overflow-hidden"
        placeholder={placeholder}
      />
    </div>
  );
}
