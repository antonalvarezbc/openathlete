import {
  useAiCredentialsQuery,
  useAiModelPreferencesQuery,
  useAiProvidersQuery,
  useDeleteAiCredentialMutation,
  useTestAiCredentialMutation,
} from '@/api/ai-settings';
import { AddAiKeyDialog } from '@/components/ai-settings/add-ai-key-dialog';
import { aiProviderName } from '@/components/ai-settings/ai-labels';
import { ConfirmAction } from '@/components/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { aiErrorMessage } from '@/utils/ai-errors';
import { KeyRound, Plus, Trash } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AiCredentialDto, AiErrorCode } from '@openathlete/shared';

import { SettingsSection } from '../settings-section';

function statusBadge(credential: AiCredentialDto) {
  if (credential.lastError === AiErrorCode.CREDENTIAL_REJECTED) {
    return <Badge variant="destructive">{m.ai_key_status_rejected()}</Badge>;
  }
  if (credential.lastError === AiErrorCode.QUOTA_EXCEEDED) {
    return <Badge variant="destructive">{m.ai_key_status_quota()}</Badge>;
  }
  if (credential.lastUsedAt) {
    return (
      <Badge variant="secondary">
        {m.ai_key_last_used({
          date: new Date(credential.lastUsedAt).toLocaleDateString(getLocale()),
        })}
      </Badge>
    );
  }
  return null;
}

export function AiKeysSection() {
  const { data: providers = [] } = useAiProvidersQuery();
  const { data: credentials = [], isPending } = useAiCredentialsQuery();
  const { data: preferences = [] } = useAiModelPreferencesQuery();
  const deleteCredential = useDeleteAiCredentialMutation();
  const testCredential = useTestAiCredentialMutation();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AiCredentialDto | null>(null);

  /** The model the key runs, or a known model of its provider. */
  const modelToTest = (credential: AiCredentialDto) =>
    preferences.find(
      (item) => item.aiCredentialId === credential.aiCredentialId,
    )?.modelId ??
    providers.find((item) => item.id === credential.provider)?.models[0]?.id;

  const handleTest = async (credential: AiCredentialDto) => {
    const modelId = modelToTest(credential);
    if (!modelId) return;
    try {
      const result = await testCredential.mutateAsync({
        aiCredentialId: credential.aiCredentialId,
        modelId,
      });
      if (result.ok) {
        toast.success(m.ai_key_test_ok({ model: modelId }));
      } else {
        toast.error(aiErrorMessage(result.code) ?? m.ai_error_provider());
      }
    } catch (error) {
      toast.error(aiErrorMessage(error) ?? m.ai_error_provider());
    }
  };

  return (
    <SettingsSection
      title={m.ai_keys_title()}
      description={m.ai_keys_description()}
      action={
        <Button onClick={() => setAddOpen(true)} disabled={!providers.length}>
          <Plus className="size-4" />
          {m.ai_key_add()}
        </Button>
      }
      contentClassName="pt-4"
    >
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : credentials.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.ai_keys_empty()}</p>
      ) : (
        <ul className="divide-y" aria-label={m.ai_keys_title()}>
          {credentials.map((credential) => (
            <li
              key={credential.aiCredentialId}
              className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <KeyRound className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{credential.label}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {aiProviderName(providers, credential.provider)}
                    {credential.apiKeyHint && ` · ${credential.apiKeyHint}`}
                    {credential.baseUrl && ` · ${credential.baseUrl}`}
                  </p>
                  {statusBadge(credential)}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(credential)}
                  disabled={
                    !modelToTest(credential) || testCredential.isPending
                  }
                >
                  {m.ai_key_test()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${m.ai_key_delete()} ${credential.label}`}
                  onClick={() => setToDelete(credential)}
                >
                  <Trash className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddAiKeyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        providers={providers}
      />
      <ConfirmAction
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteCredential.mutateAsync(toDelete.aiCredentialId);
          toast.success(m.ai_key_deleted());
          setToDelete(null);
        }}
        title={m.ai_key_delete()}
        message={m.ai_key_delete_confirm()}
        isLoading={deleteCredential.isPending}
      />
    </SettingsSection>
  );
}
