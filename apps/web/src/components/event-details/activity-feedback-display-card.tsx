import { useGetActivityFeedbackQuestionsQuery } from '@/api/activity-feedback';
import { useAiAccessQuery } from '@/api/ai-settings';
import { AiSetupDialog } from '@/components/ai-settings';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

import { ActivityEvent, AiTask } from '@openathlete/shared';

import { FeedbackQuestionnaireStatus } from '../activity-feedback/feedback-questionnaire-status';

interface P {
  event: ActivityEvent;
}

export function ActivityFeedbackDisplayCard({ event }: P) {
  const feedback = useGetActivityFeedbackQuestionsQuery(event.eventId);
  const questions =
    feedback.data?.questions ??
    (event.feedbackQuestions ?? []).map((q) => ({
      ...q,
      questionId: q.activityFeedbackQuestionId,
    }));
  // Questions run on the athlete's or a coach's AI key, or hosted AI
  const { data: aiAccess } = useAiAccessQuery(event.athleteId ?? undefined);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);

  // No AI for the athlete and no questions were generated
  const hasNoAccess =
    aiAccess?.tasks[AiTask.POST_ACTIVITY_QUESTIONS].available === false;
  const hasNoQuestions = questions.length === 0;
  const showPaywallAlert = hasNoAccess && hasNoQuestions;

  return (
    <>
      <Card className="flex flex-col col-span-2 sm:col-span-1">
        <CardHeader>
          <CardTitle>{m.feedback_title()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback.isPending ? (
            <p>{m.loading_feedback_questions()}</p>
          ) : feedback.isError ? (
            <div role="alert">
              <p>{m.feedback_load_error()}</p>
              <Button variant="outline" onClick={() => feedback.refetch()}>
                {m.coach_load_retry()}
              </Button>
            </div>
          ) : (
            <FeedbackQuestionnaireStatus
              eventId={event.eventId}
              questions={questions}
              skipped={
                feedback.data?.feedbackSkipped ?? event.feedbackSkipped ?? false
              }
              canGenerate={!showPaywallAlert}
            />
          )}
          {showPaywallAlert && (
            <Alert className="mb-4">
              <SparklesIcon className="h-4 w-4" />
              <AlertTitle>{m.ai_feedback_questions_off_title()}</AlertTitle>
              <AlertDescription className="mt-2 flex flex-col gap-3">
                <span>{m.ai_feedback_questions_off_description()}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setAiSetupOpen(true)}
                >
                  {m.ai_setup_title()}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {questions.map((question) => (
            <div key={question.questionId} className="space-y-2">
              <p className="text-sm font-medium">{question.questionText}</p>
              <p className="text-sm text-muted-foreground">
                {question.answerText?.trim() || m.feedback_unanswered()}
              </p>
            </div>
          ))}
          {event.description && event.description.trim() !== '' && (
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">{m.comment()}</p>
              <p className="text-sm text-muted-foreground">
                {event.description}
              </p>
            </div>
          )}
          {event.rpe !== null && event.rpe !== undefined && (
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">{m.rpe()}</p>
              <p className="text-sm text-muted-foreground">
                {Math.round(event.rpe * 10)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        analyticsSource="activity_feedback_display"
      />
    </>
  );
}
