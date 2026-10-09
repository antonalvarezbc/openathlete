import { m } from '@/paraglide/messages';

import { INJURY_STATUS } from '@openathlete/shared';

export const injuryStatusLabelMap: Record<INJURY_STATUS, string> = {
  [INJURY_STATUS.WORSENING]: m.injury_status_worsening(),
  [INJURY_STATUS.IMPROVING]: m.injury_status_improving(),
  [INJURY_STATUS.STABLE]: m.injury_status_stable(),
  [INJURY_STATUS.RESOLVED]: m.injury_status_resolved(),
};
