'use client';

import { useTranslations } from 'next-intl';

import type { QuestionData } from '@/components/Activities/ExamActivity/state/examTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Checkbox } from '@components/ui/checkbox';
import { Label } from '@components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';

interface ExamQuestionCardProps {
  question: QuestionData;
  questionNumber: number;
  answer: Record<number, any>;
  onAnswerChange: (questionId: number, answer: any) => void;
}

function getAnswerOptionId(option: QuestionData['answer_options'][number], visualIndex: number): number {
  return typeof option.option_id === 'number' ? option.option_id : visualIndex;
}

export default function ExamQuestionCard({ question, questionNumber, answer, onAnswerChange }: ExamQuestionCardProps) {
  const t = useTranslations('Activities.ExamActivity');
  const questionId = question.id;

  return (
    <Card
      role="group"
      aria-labelledby={`question-title-${questionId}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span id={`question-title-${questionId}`}>{t('questionNumber', { number: questionNumber })}</span>
          <span className="text-muted-foreground text-sm font-normal">{t('points', { count: question.points ?? 0 })}</span>
        </CardTitle>
        <CardDescription className="text-foreground mt-4 text-xl leading-relaxed">
          {question.question_text}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <QuestionInput
          question={question}
          answer={answer}
          onAnswerChange={onAnswerChange}
        />
      </CardContent>
    </Card>
  );
}

function QuestionInput({
  question,
  answer,
  onAnswerChange,
}: {
  question: QuestionData;
  answer: Record<number, any>;
  onAnswerChange: (questionId: number, answer: any) => void;
}) {
  const t = useTranslations('Activities.ExamActivity');
  const questionId = question.id;

  switch (question.question_type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const rawAnswer = answer[questionId];
      const radioValue = (() => {
        if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return '';
        if (typeof rawAnswer === 'boolean') return rawAnswer ? '1' : '0';
        if (typeof rawAnswer === 'number') return String(rawAnswer);
        if (typeof rawAnswer === 'string') {
          const parsed = Number.parseInt(rawAnswer, 10);
          return Number.isNaN(parsed) ? '' : String(parsed);
        }
        return '';
      })();

      return (
        <RadioGroup
          value={radioValue}
          onValueChange={(value) => onAnswerChange(questionId, Number.parseInt(value, 10))}
          className="space-y-2"
          aria-labelledby={`question-title-${questionId}`}
        >
          {question.answer_options.map((option, index) => (
            <div
              key={index}
              className="border-border hover:bg-muted flex items-center space-x-3 rounded-lg border p-4 transition-colors"
            >
              <RadioGroupItem
                value={getAnswerOptionId(option, index).toString()}
                id={`q${questionId}-${index}`}
              />
              <Label
                htmlFor={`q${questionId}-${index}`}
                className="flex-1 cursor-pointer text-base leading-relaxed"
              >
                {option.text}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }

    case 'MULTIPLE_CHOICE': {
      const selectedAnswers = answer[questionId] || [];
      return (
        <div className="space-y-2">
          {question.answer_options.map((option, index) => {
            const optionId = getAnswerOptionId(option, index);
            return (
              <div
                key={index}
                className="border-border hover:bg-muted flex items-center space-x-3 rounded-lg border p-4 transition-colors"
              >
                <Checkbox
                  id={`q${questionId}-${index}`}
                  checked={selectedAnswers.includes(optionId)}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...selectedAnswers, optionId]
                      : selectedAnswers.filter((id: number) => id !== optionId);
                    onAnswerChange(questionId, next);
                  }}
                />
                <Label
                  htmlFor={`q${questionId}-${index}`}
                  className="flex-1 cursor-pointer text-base leading-relaxed"
                >
                  {option.text}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }

    case 'MATCHING': {
      const matchAnswers = answer[questionId] || {};
      const matchOptions = question.answer_options.map((option) => ({
        value: option.right ?? '',
        label: option.right,
      }));
      return (
        <div className="space-y-3">
          {question.answer_options.map((option, index) => (
            <div
              key={index}
              className="border-border flex items-center gap-4 rounded-lg border p-4"
            >
              <span className="min-w-[200px] text-base font-medium">{option.left}</span>
              <span className="text-muted-foreground">-&gt;</span>
              <NativeSelect
                value={matchAnswers[option.left || ''] ?? ''}
                onChange={(event) =>
                  onAnswerChange(questionId, {
                    ...matchAnswers,
                    [option.left || '']: event.target.value,
                  })
                }
                className="w-full"
                aria-label={t('selectMatch')}
              >
                <NativeSelectOption
                  value=""
                  disabled
                  hidden
                >
                  {t('selectMatch')}
                </NativeSelectOption>
                {matchOptions.map((matchOption) => (
                  <NativeSelectOption
                    key={matchOption.value}
                    value={matchOption.value}
                  >
                    {matchOption.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
      );
    }

    default:
      return <p>{t('unsupportedQuestionType')}</p>;
  }
}
