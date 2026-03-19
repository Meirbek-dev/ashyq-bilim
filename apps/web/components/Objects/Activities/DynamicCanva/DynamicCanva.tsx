import MathEquationBlock from '@components/Objects/Editor/Extensions/MathEquation/MathEquationBlock';
import WarningCallout from '@components/Objects/Editor/Extensions/Callout/Warning/WarningCallout';
import { NoTextInput } from '@components/Objects/Editor/Extensions/NoTextInput/NoTextInput';
import EmbedObjects from '@components/Objects/Editor/Extensions/EmbedObjects/EmbedObjects';
import InfoCallout from '@components/Objects/Editor/Extensions/Callout/Info/InfoCallout';
import WebPreview from '@components/Objects/Editor/Extensions/WebPreview/WebPreview';
import Scenarios from '@components/Objects/Editor/Extensions/Scenarios/Scenarios';
import VideoBlock from '@components/Objects/Editor/Extensions/Video/VideoBlock';
import ImageBlock from '@components/Objects/Editor/Extensions/Image/ImageBlock';
import Flipcard from '@components/Objects/Editor/Extensions/Flipcard/Flipcard';
import UserBlock from '@components/Objects/Editor/Extensions/Users/UserBlock';
import EditorOptionsProvider from '@components/Contexts/Editor/EditorContext';
import QuizBlock from '@components/Objects/Editor/Extensions/Quiz/QuizBlock';
import Buttons from '@components/Objects/Editor/Extensions/Buttons/Buttons';
import PDFBlock from '@components/Objects/Editor/Extensions/PDF/PDFBlock';
import Badges from '@components/Objects/Editor/Extensions/Badges/Badges';
import { getLinkExtension } from '@components/Objects/Editor/EditorConf';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { CustomHeading } from './CustomHeadingExtenstion';
import TableHeader from '@tiptap/extension-table-header';
import { EditorContent, useEditor } from '@tiptap/react';
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import TableCell from '@tiptap/extension-table-cell';
import java from 'highlight.js/lib/languages/java';
import TableRow from '@tiptap/extension-table-row';
import html from 'highlight.js/lib/languages/xml';
import { common, createLowlight } from 'lowlight';
import css from 'highlight.js/lib/languages/css';
import AICanvaToolkit from './AI/AICanvaToolkit';
// Custom Extensions
import { useIsMobile } from '@/hooks/use-mobile';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import TableOfContents from './TableOfContents';
import styles from './DynamicCanva.module.css';
import StarterKit from '@tiptap/starter-kit';

// Lowlight initialization at module scope (one-time)
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

interface Editor {
  content: string;
  activity: any;
}

const Canva = (props: Editor) => {
  /**
   * Important Note : This is a workaround to enable user interaction features to be implemented easily, like text selection, AI features and other planned features, this is set to true but otherwise it should be set to false.
   * Another workaround is implemented below to disable the editor from being edited by the user by setting the caret-color to transparent and using a custom extension to filter out transactions that add/edit/remove text.
   * To let the various Custom Extensions know that the editor is not editable, React context (EditorOptionsProvider) will be used instead of props.extension.options.editable.
   */
  const isEditable = true;
  const isMobile = useIsMobile();

  const lowlightConfig = LOWLIGHT;

  const extensions = [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      bulletList: {
        HTMLAttributes: {
          class: 'bullet-list',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'ordered-list',
        },
      },
    }),
    CustomHeading,
    NoTextInput,
    // Custom Extensions
    InfoCallout.configure({
      editable: isEditable,
    }),
    WarningCallout.configure({
      editable: isEditable,
    }),
    ImageBlock.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    VideoBlock.configure({
      editable: true,
      activity: props.activity,
    }),
    MathEquationBlock.configure({
      editable: false,
      activity: props.activity,
    }),
    PDFBlock.configure({
      editable: true,
      activity: props.activity,
    }),
    QuizBlock.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    Youtube.configure({
      controls: true,
      modestBranding: true,
    }),
    CodeBlockLowlight.configure({
      lowlight: lowlightConfig,
    }),
    EmbedObjects.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    Badges.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    Buttons.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    UserBlock.configure({
      editable: isEditable,
      activity: props.activity,
    }),
    Table.configure({
      resizable: true,
    }),
    getLinkExtension(),
    WebPreview.configure({
      editable: true,
      activity: props.activity,
    }),
    Flipcard.configure({
      editable: false,
      activity: props.activity,
    }),
    Scenarios.configure({
      editable: false,
      activity: props.activity,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ];

  const editor: any = useEditor({
    editable: isEditable,
    immediatelyRender: false,
    extensions,
    content: props.content,
  });

  return (
    <EditorOptionsProvider options={{ isEditable: false }}>
      <div className="w-full mx-auto relative">
        <div className="absolute inset-0 pointer-events-none z-[1000] [&>*]:pointer-events-auto">
          <AICanvaToolkit
            activity={props.activity}
            editor={editor}
          />
        </div>
        <div className={styles.contentWrapper}>
          {!isMobile && <TableOfContents editor={editor} />}
          <EditorContent editor={editor} />
        </div>
      </div>
    </EditorOptionsProvider>
  );
};

export default Canva;
