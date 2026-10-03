import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API_BASE_URL } from '@/config';
import { m } from '@/paraglide/messages';
import client from '@/utils/axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AccessTokenDto,
  CreateAccessToken,
  CreatedAccessTokenDto,
} from '@openathlete/shared';

import { SettingsSection } from './settings-section';

const tokensKey = ['access-tokens'];
const expiryOptions = ['30', '90', '365', 'never'] as const;

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(m.access_token_copied());
  } catch {
    toast.error(m.access_token_copy_failed());
  }
}

/**
 * Personal access tokens for the OpenAthlete MCP server: read-only, shown
 * once, revocable. Lets AI assistants (Claude Code/Desktop) read your data.
 */
export function AccessTokensCard() {
  const cache = useQueryClient();
  const [name, setName] = useState('Claude');
  const [expiry, setExpiry] = useState<(typeof expiryOptions)[number]>('90');
  const [created, setCreated] = useState<CreatedAccessTokenDto | null>(null);
  const [revoking, setRevoking] = useState<AccessTokenDto | null>(null);

  const tokens = useQuery({
    queryKey: tokensKey,
    queryFn: async () =>
      (await client.get<AccessTokenDto[]>('/access-tokens')).data,
  });
  const create = useMutation({
    mutationFn: async (body: CreateAccessToken) =>
      (await client.post<CreatedAccessTokenDto>('/access-tokens', body)).data,
    onSuccess: (token) => {
      setCreated(token);
      cache.invalidateQueries({ queryKey: tokensKey });
    },
    onError: () => toast.error(m.access_token_create_failed()),
  });
  const revoke = useMutation({
    mutationFn: async (token: AccessTokenDto) =>
      client.delete(`/access-tokens/${token.personalAccessTokenId}`),
    onSuccess: () => {
      setRevoking(null);
      cache.invalidateQueries({ queryKey: tokensKey });
      toast.success(m.access_token_revoked());
    },
  });

  const command = created
    ? `claude mcp add openathlete -e OPENATHLETE_URL=${API_BASE_URL} -e OPENATHLETE_TOKEN=${created.token} -- node /path/to/openathlete/apps/mcp/dist/index.js`
    : '';

  return (
    <SettingsSection
      title={m.access_tokens_title()}
      description={m.access_tokens_description()}
    >
      <div className="space-y-6">
        {created ? (
          <div
            role="status"
            className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30"
          >
            <p className="font-medium">{m.access_token_shown_once()}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1">
                {created.token}
              </code>
              <Button
                size="sm"
                variant="outline"
                aria-label={m.access_token_copy()}
                onClick={() => copy(created.token)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p>{m.access_token_setup_help()}</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 text-xs">
                {command}
              </code>
              <Button
                size="sm"
                variant="outline"
                aria-label={m.access_token_copy()}
                onClick={() => copy(command)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <Button size="sm" onClick={() => setCreated(null)}>
              {m.access_token_done()}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              create.mutate({
                name: name.trim(),
                expiresInDays:
                  expiry === 'never' ? null : (Number(expiry) as 30 | 90 | 365),
              });
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="access-token-name">{m.access_token_name()}</Label>
              <Input
                id="access-token-name"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-token-expiry">
                {m.access_token_expiry()}
              </Label>
              <Select
                value={expiry}
                onValueChange={(value) =>
                  setExpiry(value as (typeof expiryOptions)[number])
                }
              >
                <SelectTrigger id="access-token-expiry" className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expiryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === 'never'
                        ? m.access_token_never()
                        : m.access_token_days({ days: option })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={!name.trim() || create.isPending}
              isLoading={create.isPending}
            >
              {m.access_token_create()}
            </Button>
          </form>
        )}

        {tokens.data?.length ? (
          <ul className="divide-y rounded-md border">
            {tokens.data.map((token) => (
              <li
                key={token.personalAccessTokenId}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{token.name}</p>
                  <p className="text-muted-foreground">
                    <code>{token.prefix}…</code> ·{' '}
                    {m.access_token_meta({
                      created: day(token.createdAt),
                      used: day(token.lastUsedAt),
                      expires: token.expiresAt
                        ? day(token.expiresAt)
                        : m.access_token_never(),
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setRevoking(token)}
                >
                  {m.access_token_revoke()}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !tokens.isPending && (
            <p className="text-sm text-muted-foreground">
              {m.access_tokens_empty()}
            </p>
          )
        )}
      </div>
      <ConfirmAction
        open={!!revoking}
        onClose={() => !revoke.isPending && setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        isLoading={revoke.isPending}
        title={m.access_token_revoke()}
        confirmText={m.access_token_revoke()}
        message={
          revoking ? m.access_token_revoke_confirm({ name: revoking.name }) : ''
        }
      />
    </SettingsSection>
  );
}
