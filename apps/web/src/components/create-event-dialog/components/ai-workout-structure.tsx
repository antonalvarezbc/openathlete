import { useGenerateWorkoutStructureMutation } from '@/api/agent';
import { m } from '@/paraglide/messages';
import { useState } from 'react';
import { toast } from 'sonner';

import type {
  CreateWorkoutStepDto,
  GenerateWorkoutStructureDto,
} from '@openathlete/shared';

import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Label } from '../../ui/label';
import { SparklesIcon } from '../../ui/sparkles-icon';
import { Textarea } from '../../ui/textarea';

type Props = {
  /** Missing for templates: the text is converted without athlete zones. */
  athleteId?: number;
  /** Current form values, read when generating. */
  session: () => Omit<
    GenerateWorkoutStructureDto,
    'athleteId' | 'instructions'
  >;
  hasSteps: boolean;
  hasAccess: boolean;
  onPaywall: () => void;
  onSteps: (steps: CreateWorkoutStepDto[]) => void;
};

/**
 * Turns a workout written in words into the steps and repeat blocks of the
 * session being edited. The text starts as the session description; name,
 * date and goals stay untouched. The result fills the editor; nothing is saved.
 */
export function AiWorkoutStructure({
  athleteId,
  session,
  hasSteps,
  hasAccess,
  onPaywall,
  onSteps,
}: Props) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const generate = useGenerateWorkoutStructureMutation();

  const openDialog = () => {
    if (!hasAccess) return onPaywall();
    // Start from the description unless there is unconverted text already.
    const description = session().description?.trim() ?? '';
    setInstructions((current) => current || description);
    setOpen(true);
  };

  const submit = () => {
    const current = session();
    const request = {
      ...current,
      name: current.name?.trim() || undefined,
      description: current.description?.trim() || undefined,
      instructions: instructions.trim() || undefined,
    };
    if (!request.name && !request.description && !request.instructions) {
      toast.error(m.ai_structure_need_text());
      return;
    }
    generate.mutate(
      { athleteId, ...request },
      {
        onSuccess: ({ steps }) => {
          if (!steps.length) {
            toast.error(m.ai_structure_failed());
            return;
          }
          onSteps(steps);
          setOpen(false);
          setInstructions('');
          toast.success(m.ai_structure_done());
        },
        onError: () => toast.error(m.ai_structure_failed()),
      },
    );
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <SparklesIcon className="mr-2 size-4" />
        {m.ai_structure_button()}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => !generate.isPending && setOpen(value)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{m.ai_structure_title()}</DialogTitle>
            <DialogDescription>{m.ai_structure_help()}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ai-structure-instructions">
              {m.ai_structure_label()}
            </Label>
            <Textarea
              id="ai-structure-instructions"
              value={instructions}
              maxLength={2000}
              rows={5}
              placeholder={m.ai_structure_placeholder()}
              onChange={(event) => setInstructions(event.target.value)}
              disabled={generate.isPending}
            />
            {hasSteps && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {m.ai_structure_replace()}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={generate.isPending}
            >
              {m.cancel()}
            </Button>
            <Button
              type="button"
              onClick={submit}
              isLoading={generate.isPending}
              disabled={generate.isPending}
            >
              {m.ai_structure_generate()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
