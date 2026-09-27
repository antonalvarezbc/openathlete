import { useSubmitQuestionAnswerMutation } from '@/api/activity-feedback';
import type { ActivityFeedbackQuestion } from '@/api/activity-feedback';
import { AudioRecorder } from '@/components/activity-feedback/audio-recorder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface P {
  eventId: number;
  questions: ActivityFeedbackQuestion[];
  onComplete: () => void;
  isEditMode?: boolean;
}

type AnswerMode = 'free' | 'qcm';

export function ActivityFeedbackFlow({
  eventId,
  questions,
  onComplete,
  isEditMode = false,
}: P) {
  const initialAnswers = Object.fromEntries(
    questions.map((q) => [q.questionId, q.answerText ?? '']),
  );
  const firstStep = isEditMode
    ? 1
    : Math.max(1, questions.findIndex((q) => !q.answerText?.trim()) + 1);
  const saving = useRef(false);
  const [saveError, setSaveError] = useState(false);

  const [currentStep, setCurrentStep] = useState(0);
  const [answerMode, setAnswerMode] = useState<AnswerMode | null>(null);
  const [answers, setAnswers] =
    useState<Record<number, string>>(initialAnswers);
  const [useQcmForCurrent, setUseQcmForCurrent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const submitMutation = useSubmitQuestionAnswerMutation(eventId);

  const handleNext = async (answerText: string) => {
    if (!answerText.trim() || saving.current) return;
    saving.current = true;
    setSaveError(false);

    const currentQuestion = questions[currentStep - 1];
    const isLastQuestion = currentStep === questions.length;

    try {
      await submitMutation.mutateAsync({
        questionId: currentQuestion.questionId,
        answerText,
      });
    } catch (error) {
      console.error('Failed to save answer:', error);
      setSaveError(true);
      return;
    } finally {
      saving.current = false;
    }

    if (isLastQuestion) {
      setCurrentStep(questions.length + 1);
      onComplete();
      toast.success(m.activity_feedback_submitted());
    } else {
      setCurrentStep(currentStep + 1);
      setUseQcmForCurrent(false);
    }
  };

  if (currentStep === 0 && answerMode === null) {
    return (
      <div className="min-h-[calc(100vh-140px)] inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center justify-center gap-6 p-8 text-center max-w-md">
          <h2 className="text-2xl font-semibold">
            {m.activity_feedback_how_to_answer()}
          </h2>
          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={() => {
                setAnswerMode('free');
                setCurrentStep(firstStep);
              }}
              size="lg"
              variant="outline"
            >
              {m.activity_feedback_free_text_recommended()}
            </Button>
            <Button
              onClick={() => {
                setAnswerMode('qcm');
                setCurrentStep(firstStep);
              }}
              size="lg"
              variant="outline"
            >
              {m.activity_feedback_qcm_faster()}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentStep - 1];
  const isLastQuestion = currentStep === questions.length;

  if (currentStep > 0 && currentStep <= questions.length) {
    const currentAnswer = answers[currentQuestion.questionId] || '';
    const isQcmMode =
      answerMode === 'qcm' || (useQcmForCurrent && currentQuestion.qcmOptions);
    return (
      <div className="min-h-[calc(100vh-140px)] inset-0 z-50 flex items-center justify-center bg-background">
        <div
          className={`flex flex-col items-center justify-center gap-6 p-8 text-center max-w-2xl w-full`}
        >
          <div className="text-sm text-muted-foreground">
            {currentStep} / {questions.length}
          </div>
          <h2 className="text-2xl font-semibold">
            {currentQuestion.questionText}
          </h2>

          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {m.feedback_answer_save_error()}
            </p>
          )}
          {isQcmMode && currentQuestion.qcmOptions ? (
            <div className="flex flex-col gap-3 w-full">
              {currentQuestion.qcmOptions.map((option, idx) => (
                <Button
                  key={idx}
                  disabled={submitMutation.isPending}
                  onClick={() => {
                    const newAnswers = {
                      ...answers,
                      [currentQuestion.questionId]: option.label,
                    };
                    setAnswers(newAnswers);
                    handleNext(option.label);
                  }}
                  variant={
                    currentAnswer === option.label ? 'default' : 'outline'
                  }
                  size="lg"
                >
                  {option.label}
                </Button>
              ))}
              {/* Button to switch back to text mode */}
              <Button
                onClick={() => {
                  setUseQcmForCurrent(false);
                  if (answerMode === 'qcm') {
                    setAnswerMode('free');
                  }
                }}
                variant="ghost"
                size="sm"
                className="mt-2"
              >
                {m.activity_feedback_answer_by_text()}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center w-full">
                  <AudioRecorder
                    disabled={submitMutation.isPending}
                    setIsRecording={setIsRecording}
                    setIsTranscribing={setIsTranscribing}
                    onTranscriptionComplete={(text) => {
                      setAnswers({
                        ...answers,
                        [currentQuestion.questionId]: text,
                      });
                    }}
                  />
                </div>
                <div
                  className={cn(
                    (isRecording || isTranscribing) &&
                      'ai-rotating-brand-border-textarea',
                  )}
                >
                  <Textarea
                    value={currentAnswer}
                    onChange={(e) =>
                      setAnswers({
                        ...answers,
                        [currentQuestion.questionId]: e.target.value,
                      })
                    }
                    placeholder={m.activity_feedback_free_text_recommended()}
                    className="min-h-[120px]"
                    maxLength={5000}
                    disabled={
                      isRecording || isTranscribing || submitMutation.isPending
                    }
                  />
                </div>
              </div>
              {currentQuestion.qcmOptions && (
                <Button
                  onClick={() => setUseQcmForCurrent(true)}
                  variant="ghost"
                  size="sm"
                >
                  {m.activity_feedback_answer_by_qcm()}
                </Button>
              )}
              <div className="flex gap-3 justify-end">
                <Button
                  onClick={() => handleNext(currentAnswer)}
                  disabled={
                    !currentAnswer.trim() ||
                    submitMutation.isPending ||
                    isRecording ||
                    isTranscribing
                  }
                >
                  {isLastQuestion
                    ? m.activity_feedback_submit()
                    : m.activity_feedback_next()}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
