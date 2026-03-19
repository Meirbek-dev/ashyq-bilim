'use client';

import { BookOpen, ChevronDown, ExternalLink, Lightbulb, Save, Sigma } from 'lucide-react';
import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import Link from '@components/ui/AppLink';
import type { ChangeEvent } from 'react';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
// CSS imported statically so it's available when BlockMath renders
import 'katex/dist/katex.min.css';

const BlockMath = dynamic(() => import('react-katex').then((m) => ({ default: m.BlockMath })), {
  ssr: false,
  loading: () => <div className="animate-pulse h-8 rounded bg-gray-100" />,
});

// Predefined LaTeX templates
const mathTemplates = [
  {
    name: 'templateFraction',
    latex: '\\frac{a}{b}',
    description: 'templateFractionDesc',
  },
  {
    name: 'templateSqrt',
    latex: '\\sqrt{x}',
    description: 'templateSqrtDesc',
  },
  {
    name: 'templateSum',
    latex: '\\sum_{i=1}^{n} x_i',
    description: 'templateSumDesc',
  },
  {
    name: 'templateIntegral',
    latex: '\\int_{a}^{b} f(x) \\, dx',
    description: 'templateIntegralDesc',
  },
  {
    name: 'templateLimit',
    latex: '\\lim_{x \\to \\infty} f(x)',
    description: 'templateLimitDesc',
  },
  {
    name: 'templateMatrix',
    latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    description: 'templateMatrixDesc',
  },
  {
    name: 'templateBinomial',
    latex: '\\binom{n}{k}',
    description: 'templateBinomialDesc',
  },
  {
    name: 'templateQuadratic',
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    description: 'templateQuadraticDesc',
  },
  {
    name: 'templateVector',
    latex: '\\vec{v} = \\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}',
    description: 'templateVectorDesc',
  },
  {
    name: 'templateSystemEq',
    latex: '\\begin{cases} a_1x + b_1y = c_1 \\\\ a_2x + b_2y = c_2 \\end{cases}',
    description: 'templateSystemEqDesc',
  },
];

// Common LaTeX symbols
const mathSymbols = [
  { symbol: '\\alpha', display: 'α' },
  { symbol: '\\beta', display: 'β' },
  { symbol: '\\gamma', display: 'γ' },
  { symbol: '\\delta', display: 'δ' },
  { symbol: '\\theta', display: 'θ' },
  { symbol: '\\pi', display: 'π' },
  { symbol: '\\sigma', display: 'σ' },
  { symbol: '\\infty', display: '∞' },
  { symbol: '\\pm', display: '±' },
  { symbol: '\\div', display: '÷' },
  { symbol: '\\cdot', display: '·' },
  { symbol: '\\leq', display: '≤' },
  { symbol: '\\geq', display: '≥' },
  { symbol: '\\neq', display: '≠' },
  { symbol: '\\approx', display: '≈' },
];

const MathEquationBlockComponent = (props: any) => {
  const t = useTranslations('DashPage.Editor.MathEquationBlock');
  const [equation, setEquation] = useState(props.node.attrs.math_equation);
  const [isEditing, _setIsEditing] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const editorState = useEditorProvider();
  const { isEditable } = editorState;
  const inputRef = useRef<HTMLInputElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const symbolsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  const handleClickOutside = useEffectEvent((event: MouseEvent) => {
    if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
      setShowTemplates(false);
    }
    if (symbolsRef.current && !symbolsRef.current.contains(event.target as Node)) {
      setShowSymbols(false);
    }
    if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
      setShowHelp(false);
    }
  });

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEquationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEquation(event.target.value);
    props.updateAttributes({
      math_equation: event.target.value,
    });
  };

  const saveEquation = () => {
    props.updateAttributes({
      math_equation: equation,
    });
    // setIsEditing(false);
  };

  const insertTemplate = (template: string) => {
    setEquation(template);
    props.updateAttributes({
      math_equation: template,
    });
    setShowTemplates(false);

    // Focus the input and place cursor at the end
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(template.length, template.length);
    }
  };

  const insertSymbol = (symbol: string) => {
    const cursorPosition = inputRef.current?.selectionStart || equation.length;
    const newEquation = equation.slice(0, cursorPosition) + symbol + equation.slice(cursorPosition);

    setEquation(newEquation);
    props.updateAttributes({
      math_equation: newEquation,
    });

    // Focus the input and place cursor after the inserted symbol
    // Use rAF instead of setTimeout(,0) for more predictable scheduling
    globalThis.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorPosition + symbol.length, cursorPosition + symbol.length);
      }
    });
  };

  return (
    <NodeViewWrapper className="block-math-equation">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col space-y-3 rounded-lg px-5 py-6 [transition:all_0.2s_ease] bg-[#f9f9f9] border border-[#eaeaea]">
          <div className="mb-1 flex items-center space-x-2 text-sm text-zinc-500">
            <Sigma size={16} />
            <span className="font-medium">{t('title')}</span>
          </div>

          <div className="soft-shadow rounded-md bg-white p-4">
            <BlockMath>{equation}</BlockMath>
          </div>

          {isEditing && isEditable ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex space-x-2">
                <div
                  ref={templatesRef}
                  className="relative"
                >
                  <button
                    onClick={() => {
                      setShowTemplates(!showTemplates);
                    }}
                    className="flex items-center space-x-1 py-[6px] px-[10px] bg-[rgba(217,217,217,0.4)] rounded-[6px] border-0 text-[13px] text-[#494949] cursor-pointer"
                  >
                    <BookOpen size={14} />
                    <span>{t('templates')}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTemplates ? (
                    <div className="absolute left-0 z-10 mt-1 max-h-80 w-64 overflow-y-auto bg-white rounded-[8px] border border-[#e2e2e2] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                      <div className="border-b p-2 text-xs text-zinc-500">{t('selectTemplate')}</div>
                      {mathTemplates.map((template, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            insertTemplate(template.latex);
                          }}
                          className="py-2 px-3 cursor-pointer [transition:background_0.15s] hover:bg-[rgba(217,217,217,0.24)]"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{t(template.name)}</span>
                            <span className="text-xs text-zinc-500">{t(template.description)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div
                  ref={symbolsRef}
                  className="relative"
                >
                  <button
                    onClick={() => {
                      setShowSymbols(!showSymbols);
                    }}
                    className="flex items-center space-x-1 py-[6px] px-[10px] bg-[rgba(217,217,217,0.4)] rounded-[6px] border-0 text-[13px] text-[#494949] cursor-pointer"
                  >
                    <Sigma size={14} />
                    <span>{t('symbols')}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showSymbols ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showSymbols ? (
                    <div className="absolute left-0 z-10 mt-1 w-64 bg-white rounded-[8px] border border-[#e2e2e2] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                      <div className="border-b p-2 text-xs text-zinc-500">{t('insertSymbol')}</div>
                      <div className="flex flex-wrap p-2">
                        {mathSymbols.map((symbol, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              insertSymbol(symbol.symbol);
                            }}
                            title={symbol.symbol}
                            className="flex items-center justify-center w-8 h-8 m-[2px] bg-[rgba(217,217,217,0.3)] rounded-[4px] border-0 text-base text-[#494949] cursor-pointer"
                          >
                            {symbol.display}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div
                  ref={helpRef}
                  className="relative"
                >
                  <button
                    onClick={() => {
                      setShowHelp(!showHelp);
                    }}
                    className="flex items-center space-x-1 py-[6px] px-[10px] bg-[rgba(217,217,217,0.4)] rounded-[6px] border-0 text-[13px] text-[#494949] cursor-pointer"
                  >
                    <Lightbulb size={14} />
                    <span>{t('help')}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${showHelp ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showHelp ? (
                    <div className="absolute left-0 z-10 mt-1 w-72 bg-white rounded-[8px] border border-[#e2e2e2] shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                      <div className="border-b p-2 text-xs font-medium text-zinc-700">{t('quickReference')}</div>
                      <div className="space-y-2 p-3 text-xs">
                        <div>
                          <span className="font-medium">{t('fractions')}</span> \frac{'{'}
                          'numerator'{'}'}
                          {'{'}denominator{'}'}
                        </div>
                        <div>
                          <span className="font-medium">{t('exponents')}</span> x^{'{'}'power'
                          {'}'}
                        </div>
                        <div>
                          <span className="font-medium">{t('subscripts')}</span> x_{'{'}
                          'subscript'
                          {'}'}
                        </div>
                        <div>
                          <span className="font-medium">{t('squareRoot')}</span> \sqrt{'{'}'x'
                          {'}'}
                        </div>
                        <div>
                          <span className="font-medium">{t('summation')}</span> \sum_{'{'}
                          'lower'
                          {'}'}^{'{'}'upper'{'}'}
                        </div>
                        <div>
                          <span className="font-medium">{t('integral')}</span> \int_{'{'}
                          'lower'
                          {'}'}^{'{'}'upper'{'}'}
                        </div>
                        <div className="border-t pt-1">
                          <Link
                            className="flex items-center font-medium text-blue-600 hover:text-blue-800"
                            href="https://katex.org/docs/supported.html"
                            target="_blank"
                          >
                            {t('completeReference')}
                            <ExternalLink
                              size={10}
                              className="ml-1"
                            />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-between rounded-lg px-[5px] pl-3 bg-white text-[#5252528d] items-center h-[45px] border border-[#e2e2e2] transition-all duration-200 focus-within:border-[#d1d1d1] focus-within:shadow-[0_0_0_2px_rgba(0,0,0,0.03)] [&>input]:w-full [&>input]:text-[#494949] [&>input]:text-sm [&>input]:font-sans [&>input]:bg-transparent [&>input]:border-none [&>input]:outline-none [&>input::placeholder]:text-[#49494980]">
                <input
                  ref={inputRef}
                  value={equation}
                  onChange={handleEquationChange}
                  placeholder={t('placeholder')}
                  type="text"
                  className="focus:ring-1 focus:ring-blue-300"
                />
                <motion.button
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-[6px] border-0 bg-[rgba(217,217,217,0.5)] text-[#494949] cursor-pointer"
                  onClick={() => {
                    saveEquation();
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title={t('save')}
                >
                  <Save size={15} />
                </motion.button>
              </div>

              <div className="flex items-center text-sm text-zinc-500 pl-[2px]">
                <span>{t('referTo')}</span>
                <Link
                  className="mx-1 inline-flex items-center font-medium text-blue-600 hover:text-blue-800"
                  href="https://katex.org/docs/supported.html"
                  target="_blank"
                >
                  {t('guideLink')}
                  <ExternalLink
                    size={12}
                    className="ml-1"
                  />
                </Link>
                <span>{t('supportedFunctions')}</span>
              </div>
            </motion.div>
          ) : null}
        </div>
      </motion.div>
    </NodeViewWrapper>
  );
};

export default MathEquationBlockComponent;
