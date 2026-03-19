'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeHelp,
  Bold,
  ChevronDown,
  Code,
  Columns,
  Cuboid,
  FileText,
  GitBranch,
  Globe,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Plus,
  RotateCw,
  Sigma,
  Table,
  Tags,
  Trash2,
  User,
  Video,
} from 'lucide-react';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import { SiYoutube } from '@icons-pack/react-simple-icons';
import { useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithRef } from 'react';
import styles from './ToolbarButtons.module.css';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

import DividerVerticalIcon from '@components/svg/DividerVerticalIcon';
import LinkInputTooltip from './LinkInputTooltip';

const ToolBtn = ({ className, ...props }: ComponentPropsWithRef<'div'>) => (
  <div
    className={cn(
      'flex bg-[rgba(217,217,217,0.24)] rounded-[6px] min-w-[28px] h-[28px] p-[6px] mr-[6px] transition-all duration-200 ease-in-out [&>svg]:p-px cursor-pointer',
      'hover:bg-[rgba(217,217,217,0.48)]',
      className === 'is-active' && 'bg-[rgba(176,176,176,0.5)] hover:bg-[rgba(139,139,139,0.5)]',
    )}
    {...props}
  />
);

const ToolSelect = ({ className, ...props }: ComponentPropsWithRef<'select'>) => (
  <select
    className={cn(
      'bg-[rgba(217,217,217,0.185)] rounded-[6px] w-[120px] border-none h-[28px] px-[6px] pr-[20px] text-[11px] font-[Inter,sans-serif] mr-[6px] cursor-pointer',
      'hover:bg-[rgba(217,217,217,0.3)] focus:outline-none focus:shadow-[0_0_0_2px_rgba(217,217,217,0.5)]',
      styles.toolSelect,
      className,
    )}
    {...props}
  />
);

export const ToolbarButtons = ({ editor, props }: any) => {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const linkButtonRef = useRef<HTMLDivElement>(null);

  // timers to prevent dropdowns from closing too quickly when user moves cursor
  const listHideTimerRef = useRef<any>(null);
  const tableHideTimerRef = useRef<any>(null);
  const linkSelectionRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (listHideTimerRef.current) {
        clearTimeout(listHideTimerRef.current);
        listHideTimerRef.current = null;
      }
      if (tableHideTimerRef.current) {
        clearTimeout(tableHideTimerRef.current);
        tableHideTimerRef.current = null;
      }
      if (linkSelectionRafRef.current) {
        cancelAnimationFrame(linkSelectionRafRef.current);
        linkSelectionRafRef.current = null;
      }
    };
  }, []);

  if (!editor) {
    return null;
  }

  const tableOptions = [
    {
      label: t('insertTable'),
      icon: <Table size={18} />,
      action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      label: t('addRowBelow'),
      icon: <Plus size={18} />,
      action: () => editor.chain().focus().addRowAfter().run(),
    },
    {
      label: t('addColumnRight'),
      icon: <Columns size={18} />,
      action: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      label: t('deleteRow'),
      icon: <Minus size={18} />,
      action: () => editor.chain().focus().deleteRow().run(),
    },
    {
      label: t('deleteColumn'),
      icon: <Trash2 size={18} />,
      action: () => editor.chain().focus().deleteColumn().run(),
    },
  ];

  const listOptions = [
    {
      label: t('listOptions.bulletList'),
      icon: <List size={18} />,
      action: () => {
        if (editor.isActive('bulletList')) {
          editor.chain().focus().toggleBulletList().run();
        } else {
          editor.chain().focus().toggleOrderedList().run();
          editor.chain().focus().toggleBulletList().run();
        }
      },
    },
    {
      label: t('listOptions.orderedList'),
      icon: <ListOrdered size={18} />,
      action: () => {
        if (editor.isActive('orderedList')) {
          editor.chain().focus().toggleOrderedList().run();
        } else {
          editor.chain().focus().toggleBulletList().run();
          editor.chain().focus().toggleOrderedList().run();
        }
      },
    },
  ];

  const handleLinkClick = () => {
    // Store the current selection
    const { from, to } = editor.state.selection;

    if (editor.isActive('link')) {
      setShowLinkInput(true);
    } else {
      setShowLinkInput(true);
    }

    // Restore the selection on next animation frame to ensure the tooltip is rendered
    if (linkSelectionRafRef.current) cancelAnimationFrame(linkSelectionRafRef.current);
    linkSelectionRafRef.current = requestAnimationFrame(() => {
      editor.commands.setTextSelection({ from, to });
    });
  };

  const getCurrentLinkUrl = () => {
    if (editor.isActive('link')) {
      return editor.getAttributes('link').href;
    }
    return '';
  };

  const handleLinkSave = (url: string) => {
    editor
      .chain()
      .focus()
      .setLink({
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
      })
      .run();
    setShowLinkInput(false);
  };

  const handleLinkCancel = () => {
    setShowLinkInput(false);
  };

  return (
    <div className="flex">
      <ToolBtn onClick={() => editor.chain().focus().undo().run()}>
        <ArrowLeft size={18} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()}>
        <ArrowRight size={18} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
      >
        <Bold size={18} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
      >
        <Italic size={18} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? 'is-active' : ''}
      >
        <Minus size={18} />
      </ToolBtn>
      <div
        className="relative inline-block"
        onMouseEnter={() => {
          if (listHideTimerRef.current) {
            clearTimeout(listHideTimerRef.current);
            listHideTimerRef.current = null;
          }
          setShowListMenu(true);
        }}
        onMouseLeave={() => {
          if (listHideTimerRef.current) {
            clearTimeout(listHideTimerRef.current);
          }
          listHideTimerRef.current = setTimeout(() => {
            setShowListMenu(false);
            listHideTimerRef.current = null;
          }, 180);
        }}
        contentEditable={false}
      >
        <ToolBtn
          onClick={() => {
            setShowListMenu(!showListMenu);
          }}
          className={showListMenu || editor.isActive('bulletList') || editor.isActive('orderedList') ? 'is-active' : ''}
        >
          <List size={18} />
          <ChevronDown size={18} />
        </ToolBtn>
        {showListMenu ? (
          <div className="absolute top-full left-0 bg-white border border-[rgba(217,217,217,0.5)] rounded-[6px] shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-[1000] min-w-[180px] mt-1">
            {listOptions.map((option, index) => (
              <div
                key={index}
                onClick={() => {
                  option.action();
                  setShowListMenu(false);
                }}
                className={`flex items-center py-2 px-3 cursor-pointer [transition:background_0.2s] hover:bg-[rgba(217,217,217,0.24)] ${
                  editor.isActive(option.label === 'Bullet List' ? 'bulletList' : 'orderedList')
                    ? 'bg-[rgba(176,176,176,0.5)]'
                    : ''
                }`}
              >
                <span className="flex items-center mr-2">{option.icon}</span>
                <span className="text-xs [font-family:Inter,sans-serif]">{option.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <ToolSelect
        value={
          editor.isActive('heading', { level: 1 })
            ? '1'
            : editor.isActive('heading', { level: 2 })
              ? '2'
              : editor.isActive('heading', { level: 3 })
                ? '3'
                : editor.isActive('heading', { level: 4 })
                  ? '4'
                  : editor.isActive('heading', { level: 5 })
                    ? '5'
                    : editor.isActive('heading', { level: 6 })
                      ? '6'
                      : '0'
        }
        onChange={(e) => {
          const { value } = e.target;
          if (value === '0') {
            editor.chain().focus().setParagraph().run();
          } else {
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number.parseInt(value, 10) })
              .run();
          }
        }}
        aria-label={t('heading')}
      >
        <option value="0">{t('paragraph')}</option>
        <option value="1">{t('headingLevel', { level: 1 })}</option>
        <option value="2">{t('headingLevel', { level: 2 })}</option>
        <option value="3">{t('headingLevel', { level: 3 })}</option>
        <option value="4">{t('headingLevel', { level: 4 })}</option>
        <option value="5">{t('headingLevel', { level: 5 })}</option>
        <option value="6">{t('headingLevel', { level: 6 })}</option>
      </ToolSelect>
      <div
        className="relative inline-block"
        onMouseEnter={() => {
          if (tableHideTimerRef.current) {
            clearTimeout(tableHideTimerRef.current);
            tableHideTimerRef.current = null;
          }
          setShowTableMenu(true);
        }}
        onMouseLeave={() => {
          if (tableHideTimerRef.current) {
            clearTimeout(tableHideTimerRef.current);
          }
          tableHideTimerRef.current = setTimeout(() => {
            setShowTableMenu(false);
            tableHideTimerRef.current = null;
          }, 180);
        }}
        contentEditable={false}
      >
        <ToolTip content={t('table')}>
          <ToolBtn
            onClick={() => {
              setShowTableMenu(!showTableMenu);
            }}
            className={showTableMenu ? 'is-active' : ''}
          >
            <Table size={18} />
            <ChevronDown size={18} />
          </ToolBtn>
        </ToolTip>
        {showTableMenu ? (
          <div className="absolute top-full left-0 bg-white border border-[rgba(217,217,217,0.5)] rounded-[6px] shadow-[0_2px_4px_rgba(0,0,0,0.1)] z-[1000] min-w-[180px] mt-1">
            {tableOptions.map((option, index) => (
              <div
                key={index}
                onClick={() => {
                  option.action();
                  setShowTableMenu(false);
                }}
                className="flex items-center py-2 px-3 cursor-pointer [transition:background_0.2s] hover:bg-[rgba(217,217,217,0.24)]"
              >
                <span className="flex items-center mr-2">{option.icon}</span>
                <span className="text-xs [font-family:Inter,sans-serif]">{option.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <DividerVerticalIcon style={{ marginTop: 'auto', marginBottom: 'auto', color: 'grey' }} />
      <ToolTip content={t('infoCallout')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'calloutInfo',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: t('defaultInfoCalloutText') }],
                  },
                ],
              })
              .run()
          }
        >
          <AlertCircle size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('warningCallout')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'calloutWarning',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: t('defaultWarningCalloutText') }],
                  },
                ],
              })
              .run()
          }
        >
          <AlertTriangle size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('link')}>
        <div style={{ position: 'relative' }}>
          <ToolBtn
            ref={linkButtonRef}
            onClick={handleLinkClick}
            className={editor.isActive('link') ? 'is-active' : ''}
          >
            <Link2 size={18} />
          </ToolBtn>
          {showLinkInput ? (
            <LinkInputTooltip
              onSave={handleLinkSave}
              onCancel={handleLinkCancel}
              currentUrl={getCurrentLinkUrl()}
            />
          ) : null}
        </div>
      </ToolTip>
      <ToolTip content={t('image')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockImage',
              })
              .run()
          }
        >
          <ImagePlus size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('video')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockVideo',
              })
              .run()
          }
        >
          <Video size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('youtubeVideo')}>
        <ToolBtn onClick={() => editor.chain().focus().insertContent({ type: 'blockEmbed' }).run()}>
          <SiYoutube size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('mathEquation')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockMathEquation',
              })
              .run()
          }
        >
          <Sigma size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('pdfDocument')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockPDF',
              })
              .run()
          }
        >
          <FileText size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('interactiveQuiz')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockQuiz',
              })
              .run()
          }
        >
          <BadgeHelp size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('codeBlock')}>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'is-active' : ''}
        >
          <Code size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('externalObject')}>
        <ToolBtn onClick={() => editor.chain().focus().insertContent({ type: 'blockEmbed' }).run()}>
          <Cuboid size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('badges')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'badge',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: t('badgePlaceholder') }],
                  },
                ],
              })
              .run()
          }
        >
          <Tags size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('button')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'button',
                content: [
                  {
                    type: 'text',
                    text: t('clickMe'),
                  },
                ],
              })
              .run()
          }
        >
          <MousePointerClick size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('user')}>
        <ToolBtn onClick={() => editor.chain().focus().insertContent({ type: 'blockUser' }).run()}>
          <User size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('webPreview')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'blockWebPreview',
              })
              .run()
          }
        >
          <Globe size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('flipcard')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'flipcard',
                attrs: {
                  question: t('flipcardQuestionDefault'),
                  answer: t('flipcardAnswerDefault'),
                  color: 'blue',
                  alignment: 'center',
                  size: 'medium',
                },
              })
              .run()
          }
        >
          <RotateCw size={18} />
        </ToolBtn>
      </ToolTip>
      <ToolTip content={t('interactiveScenarios')}>
        <ToolBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'scenarios',
                attrs: {
                  title: t('defaultScenario.title'),
                  scenarios: [
                    {
                      id: '1',
                      text: t('defaultScenario.scenarios.1.text'),
                      imageUrl: '',
                      options: [
                        { id: 'opt1', text: t('defaultScenario.scenarios.1.options.opt1'), nextScenarioId: '2' },
                        { id: 'opt2', text: t('defaultScenario.scenarios.1.options.opt2'), nextScenarioId: '3' },
                      ],
                    },
                    {
                      id: '2',
                      text: t('defaultScenario.scenarios.2.text'),
                      imageUrl: '',
                      options: [
                        { id: 'opt3', text: t('defaultScenario.scenarios.2.options.opt3'), nextScenarioId: '1' },
                        { id: 'opt4', text: t('defaultScenario.scenarios.2.options.opt4'), nextScenarioId: null },
                      ],
                    },
                    {
                      id: '3',
                      text: t('defaultScenario.scenarios.3.text'),
                      imageUrl: '',
                      options: [
                        { id: 'opt5', text: t('defaultScenario.scenarios.3.options.opt5'), nextScenarioId: '1' },
                        { id: 'opt6', text: t('defaultScenario.scenarios.3.options.opt6'), nextScenarioId: null },
                      ],
                    },
                  ],
                  currentScenarioId: '1',
                },
              })
              .run()
          }
          aria-label={t('aria.insertInteractiveScenarios')}
        >
          <GitBranch size={18} />
        </ToolBtn>
      </ToolTip>
    </div>
  );
};
