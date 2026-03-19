'use client';
import { useAIEditor, useAIEditorDispatch } from '@components/Contexts/AI/AIEditorContext';
import type { AIEditorStateTypes } from '@components/Contexts/AI/AIEditorContext';

import MathEquationBlock from './Extensions/MathEquation/MathEquationBlock';
import WarningCallout from './Extensions/Callout/Warning/WarningCallout';
import { getCourseThumbnailMediaDirectory } from '@services/media/media';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import DividerVerticalIcon from '@components/svg/DividerVerticalIcon';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { CourseProvider } from '@components/Contexts/CourseContext';
import EmbedObjects from './Extensions/EmbedObjects/EmbedObjects';
import InfoCallout from './Extensions/Callout/Info/InfoCallout';
import platformLogoLight from '@public/platform_logo_light.svg';
import WebPreview from './Extensions/WebPreview/WebPreview';
import { ToolbarButtons } from './Toolbar/ToolbarButtons';
import Scenarios from './Extensions/Scenarios/Scenarios';
import TableHeader from '@tiptap/extension-table-header';
import { getAbsoluteUrl } from '@services/config/config';
import { EditorContent, useEditor } from '@tiptap/react';
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import VideoBlock from './Extensions/Video/VideoBlock';
import ImageBlock from './Extensions/Image/ImageBlock';
import Flipcard from './Extensions/Flipcard/Flipcard';
import TableCell from '@tiptap/extension-table-cell';
import UserBlock from './Extensions/Users/UserBlock';
import platformLogo from '@public/platform_logo.svg';
// Extensions
import QuizBlock from './Extensions/Quiz/QuizBlock';
import java from 'highlight.js/lib/languages/java';
import Buttons from './Extensions/Buttons/Buttons';
import TableRow from '@tiptap/extension-table-row';
import AIEditorToolkit from './AI/AIEditorToolkit';
import html from 'highlight.js/lib/languages/xml';
import { common, createLowlight } from 'lowlight';
import css from 'highlight.js/lib/languages/css';
import PDFBlock from './Extensions/PDF/PDFBlock';
import { useIsMobile } from '@/hooks/use-mobile';
import Badges from './Extensions/Badges/Badges';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import { getLinkExtension } from './EditorConf';
import StarterKit from '@tiptap/starter-kit';
import { Eye, Monitor } from 'lucide-react';

// Initialize lowlight once at module load
const LOWLIGHT = (() => {
  const lowlight = createLowlight(common);
  lowlight.register('html', html);
  lowlight.register('css', css);
  lowlight.register('js', js);
  lowlight.register('ts', ts);
  lowlight.register('python', python);
  lowlight.register('java', java);
  return lowlight;
})();

// Editor extensions static configuration
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    bulletList: { HTMLAttributes: { class: 'bullet-list' } },
    orderedList: { HTMLAttributes: { class: 'ordered-list' } },
  }),
  // other extensions can be added here if needed
];
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import styles from './Editor.module.css';
import UserAvatar from '../UserAvatar';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface EditorProps {
  content: string;
  activity: any;
  course: any;
  org: any;
  session: any;
  setContent: (content: any) => void;
}

const Editor = (props: EditorProps) => {
  const t = useTranslations('DashPage.Editor.Editor');

  // Add defensive checks for context hooks
  let dispatchAIEditor: any = null;
  let aiEditorState: AIEditorStateTypes | null = null;

  dispatchAIEditor = useAIEditorDispatch();
  aiEditorState = useAIEditor();

  const courseUuid = props.course.course_uuid.slice(7);
  const activityUuid = props.activity.activity_uuid.slice(9);

  const lowlightConfig = LOWLIGHT;
  const extensions = [
    ...EDITOR_EXTENSIONS,
    InfoCallout.configure({ editable: true }),
    WarningCallout.configure({ editable: true }),
    ImageBlock.configure({ editable: true, activity: props.activity }),
    VideoBlock.configure({ editable: true, activity: props.activity }),
    MathEquationBlock.configure({ editable: true, activity: props.activity }),
    PDFBlock.configure({ editable: true, activity: props.activity }),
    QuizBlock.configure({ editable: true, activity: props.activity }),
    Youtube.configure({ controls: true, modestBranding: true }),
    CodeBlockLowlight.configure({ lowlight: lowlightConfig }),
    EmbedObjects.configure({ editable: true, activity: props.activity }),
    Badges.configure({ editable: true, activity: props.activity }),
    Buttons.configure({ editable: true, activity: props.activity }),
    UserBlock.configure({ editable: true, activity: props.activity }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    getLinkExtension(),
    WebPreview.configure({ editable: true, activity: props.activity }),
    Flipcard.configure({ editable: true, activity: props.activity }),
    Scenarios.configure({ editable: true, activity: props.activity }),
  ];

  const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

  function isValidEditorContent(content: any) {
    if (!content) return false;
    if (typeof content === 'string') return true;
    if (typeof content !== 'object') return false;
    if (content.type === 'doc') return true;
    if (Array.isArray(content.content)) return true;
    return false;
  }

  const initialContent = isValidEditorContent(props.content) ? props.content : EMPTY_DOC;

  const editor: any = useEditor({
    editable: true,
    extensions,
    content: initialContent,
    immediatelyRender: false,
  });

  // Destructure setContent for stable reference
  const { setContent } = props;

  function handleContentSave() {
    if (editor) {
      setContent(editor.getJSON());
    }
  }

  const isMobile = useIsMobile();
  if (isMobile) {
    // TODO: Work on a better editor mobile experience
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f8f8f8] p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h2 className="mb-4 text-xl font-bold">{t('mobileTitle')}</h2>
          <Monitor
            className="mx-auto my-5"
            size={60}
          />
          <p>{t('mobileMessage1')}</p>
          <p>{t('mobileMessage2')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <CourseProvider courseuuid={props.course.course_uuid}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          key="modal"
          transition={{
            type: 'spring',
            stiffness: 360,
            damping: 70,
            delay: 0.02,
          }}
          exit={{ opacity: 0 }}
        >
          <div
            className={cn(styles.editorTop, 'bg-opacity-95 fixed bg-white backdrop-blur-sm backdrop-brightness-125')}
          >
            <div className="flex flex-col">
              <div className="flex flex-row mb-[5px]">
                <Link href="/">
                  <Image
                    className="rounded-[6px]"
                    width={25}
                    height={25}
                    src={platformLogo}
                    alt="Ashyq Bilim logo"
                  />
                </Link>
                <Link
                  target="_blank"
                  href={`/course/${courseUuid}`}
                >
                  <img
                    className="h-[25px] w-14 object-cover object-top rounded-[7px] ml-[5px] hover:cursor-pointer"
                    src={`${
                      props.course.thumbnail_image
                        ? getCourseThumbnailMediaDirectory(
                            props.course.course_uuid,
                            props.course.thumbnail_image,
                          )
                        : getAbsoluteUrl('/empty_thumbnail.webp')
                    }`}
                    alt={`${props.course.name} Thumbnail`}
                  />
                </Link>
                <div className={styles.editorInfoDocName}>
                  <b>{props.course.name}</b> <DividerVerticalIcon className="size-7" /> {props.activity.name}{' '}
                </div>
              </div>
              <div>
                <ToolbarButtons editor={editor} />
              </div>
            </div>
            <div className="flex justify-center items-center space-x-2">
              <div>
                <div className="rounded-md text-teal-100 transition-all ease-linear hover:cursor-pointer">
                  {dispatchAIEditor && aiEditorState ? (
                    <div
                      onClick={() =>
                        dispatchAIEditor({
                          type: aiEditorState.isModalOpen ? 'setIsModalClose' : 'setIsModalOpen',
                        })
                      }
                      style={{
                        background:
                          'linear-gradient(135deg, oklch(0.25 0.15 270) 0%, oklch(0.40 0.18 260) 50%, oklch(0.32 0.16 255) 100%)',
                      }}
                      className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm text-white drop-shadow-md transition delay-150 duration-300 ease-in-out hover:scale-105 hover:cursor-pointer"
                      title={t('aiEditor')}
                    >
                      <Image
                        className=""
                        width={16}
                        height={16}
                        src={platformLogoLight}
                        alt="AI Editor Icon"
                      />
                      <i className="text-xs font-bold not-italic">{t('aiEditor')}</i>
                    </div>
                  ) : null}
                </div>
              </div>
              <DividerVerticalIcon
                style={{
                  marginTop: 'auto',
                  marginBottom: 'auto',
                  color: 'grey',
                  opacity: '0.5',
                }}
              />
              <div className="flex justify-center items-center space-x-2">
                <div
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-teal-100 shadow-sm transition-all ease-linear hover:cursor-pointer hover:bg-sky-700"
                  onClick={handleContentSave}
                >
                  {t('save')}
                </div>
                <ToolTip content={t('preview')}>
                  <Link
                    target="_blank"
                    href={`/course/${courseUuid}/activity/${activityUuid}`}
                  >
                    <div className="flex h-9 items-center justify-center rounded-lg bg-neutral-600 px-3 py-2 text-sm font-bold text-neutral-100 shadow-sm transition-all ease-linear hover:cursor-pointer hover:bg-neutral-700">
                      <Eye
                        className="mx-auto items-center"
                        size={14}
                      />
                    </div>
                  </Link>
                </ToolTip>
              </div>
              <DividerVerticalIcon
                style={{
                  marginTop: 'auto',
                  marginBottom: 'auto',
                  color: 'grey',
                  opacity: '0.5',
                }}
              />

              <div className={styles.editorUserProfileWrapper}>
                <UserAvatar
                  size="lg"
                  variant="outline"
                  use_with_session
                />
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 360,
            damping: 70,
            delay: 0.5,
          }}
          exit={{ opacity: 0 }}
        >
          <div className={styles.editorContentWrapper}>
            <AIEditorToolkit
              activity={props.activity}
              editor={editor}
            />
            <EditorContent editor={editor} />
          </div>
        </motion.div>
      </CourseProvider>
    </div>
  );
};

export default Editor;

export const EditorContentWrapper = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn(styles.editorContentWrapper, className)}>{children}</div>
);
