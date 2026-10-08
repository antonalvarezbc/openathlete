import { m } from '@/paraglide/messages';
import { useForm } from 'react-hook-form';

import { SPORT_TYPE } from '@openathlete/shared';

import {
  FormProvider,
  RHFMultiSportSelector,
  RHFTextField,
} from '../hook-form';
import { ALL_SPORTS } from '../training-zone-editor/sport-summary';
import { Button } from '../ui/button';

export interface TrainingZoneFormValues {
  name: string;
  description?: string;
  min: number;
  max: number;
  color: string;
  sports: SPORT_TYPE[];
}

export function TrainingZoneForm({
  defaultValues,
  onSubmit,
  isLoading,
}: {
  defaultValues?: Partial<TrainingZoneFormValues>;
  onSubmit: (values: TrainingZoneFormValues) => void;
  isLoading?: boolean;
}) {
  const methods = useForm<TrainingZoneFormValues>({
    defaultValues: {
      name: '',
      description: '',
      min: 0,
      max: 0,
      color: '#cccccc',
      sports: defaultValues?.sports ?? ALL_SPORTS,
      ...defaultValues,
    },
  });

  return (
    <FormProvider
      methods={methods}
      onSubmit={methods.handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <RHFTextField name="name" label={m.name()} required />
      <RHFTextField name="description" label={m.description()} />
      <div className="flex gap-2">
        <RHFTextField name="min" label={m.min()} type="number" required />
        <RHFTextField name="max" label={m.max()} type="number" required />
      </div>
      <RHFTextField
        name="color"
        label={m.color()}
        type="color"
        required
        className="w-16 h-10 p-0 border-none radi"
      />
      <RHFMultiSportSelector name="sports" label={m.sports()} />
      <Button type="submit" className="w-full" isLoading={isLoading}>
        {m.save()}{' '}
      </Button>
    </FormProvider>
  );
}
