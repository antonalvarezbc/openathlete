import { m } from '@/paraglide/messages';
import { ExternalLink, FileUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const SELF_HOSTING_DEVICE_SYNC_DOCS =
  'https://docs.openathlete.org/docs/getting-started/self-hosting#device-sync';

/**
 * Shown when the instance has no device connector set up, as most
 * self-hosted ones: files remain the way in.
 */
export function ConnectorsUnavailable({ action }: { action?: ReactNode }) {
  return (
    <Card data-connectors-unavailable>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileUp className="h-5 w-5" />
          {m.connectors_unavailable_title()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{m.connectors_unavailable_text()}</p>
        {action}
        <a
          href={SELF_HOSTING_DEVICE_SYNC_DOCS}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        >
          {m.connectors_unavailable_docs()}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
