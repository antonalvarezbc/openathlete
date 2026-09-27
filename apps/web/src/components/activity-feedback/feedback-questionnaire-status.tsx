import { useGenerateFeedbackQuestionsMutation } from '@/api/activity-feedback';
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { useAuthContext } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { isAxiosError } from 'axios';

export function FeedbackQuestionnaireStatus({
  eventId,
  questions,
  skipped,
  canGenerate = true,
}: {
  eventId: number;
  questions: Array<{ answerText: string | null }>;
  skipped: boolean;
  canGenerate?: boolean;
}) {
  const { user } = useAuthContext();
  const generate = useGenerateFeedbackQuestionsMutation(eventId);
  const answered = questions.filter((q) => q.answerText?.trim()).length;
  const message = isAxiosError(generate.error)
    ? generate.error.response?.data?.message
    : undefined;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" role="status">
        {!questions.length
          ? m.feedback_not_generated()
          : skipped
            ? m.activity_feedback_skipped()
            : answered === questions.length
              ? m.activity_feedback_completed_via_questions()
              : m.feedback_progress({ answered, total: questions.length })}
      </p>
      {!questions.length && canGenerate && user && (
        <>
          <p className="text-xs text-muted-foreground">
            {m.feedback_generate_help()}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            <SparklesIcon className="size-4" />
            {generate.isPending
              ? m.feedback_generating()
              : m.feedback_generate()}
          </Button>
          {generate.isError && (
            <p role="alert" className="text-sm text-destructive">
              {message === 'FEEDBACK_DISABLED'
                ? m.feedback_generation_disabled()
                : message === 'FEEDBACK_AI_UNAVAILABLE'
                  ? m.feedback_ai_unavailable()
                  : message === 'FEEDBACK_MODEL_NOT_CONFIGURED'
                    ? m.feedback_model_not_configured()
                    : message === 'FEEDBACK_PROVIDER_ERROR'
                      ? m.feedback_provider_error()
                      : m.feedback_generation_error()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
