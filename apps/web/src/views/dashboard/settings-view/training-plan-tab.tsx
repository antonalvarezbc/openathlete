import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { useSearchParams } from 'react-router-dom';

import { PlanAdaptationSection } from './plan-adaptation-section';
import { SettingsSection } from './settings-section';

export function TrainingPlanTab() {
  const [, setSearchParams] = useSearchParams();

  return (
    <div className="space-y-6">
      <SettingsSection
        title={m.training_plan_settings()}
        description={m.json_plan_review_help()}
        contentClassName="pt-6"
      >
        <Button
          onClick={() =>
            setSearchParams((params) => {
              params.set('importPlan', 'json');
              return params;
            })
          }
        >
          {m.json_plan_import()}
        </Button>
      </SettingsSection>
      <PlanAdaptationSection />
    </div>
  );
}
