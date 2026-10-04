import { useLoginMutation } from '@/api/auth';
import { AuthAPI } from '@/api/auth/auth.api';
import { useCreateAccountMutation } from '@/api/user';
import { FormProvider, RHFTextField } from '@/components/hook-form';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { getPath } from '@/routes/paths';
import { localizedNewPasswordSchema } from '@/utils/password';
import { cn } from '@/utils/shadcn';
import { OAuthButtons } from '@/views/auth/oauth-buttons';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import z from 'zod';

import { createAccountDtoSchema } from '@openathlete/shared';

const PLAN_TOKEN_STORAGE_KEY = 'pendingPlanToken';

export function CreateAccountView({ className }: React.ComponentProps<'form'>) {
  const { initialize } = useAuthContext();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get('invitation');
  const coachInvitationToken = searchParams.get('coach-invitation');
  const planToken = searchParams.get('planToken');
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);
  const [isVerifyingInvitation, setIsVerifyingInvitation] = useState(false);
  const methods = useForm<z.infer<typeof createAccountDtoSchema>>({
    resolver: zodResolver(
      createAccountDtoSchema.extend({ password: localizedNewPasswordSchema() }),
    ),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      invitationToken: invitationToken || undefined,
      coachInvitationToken: coachInvitationToken || undefined,
    },
  });

  // Store planToken in sessionStorage if present
  useEffect(() => {
    if (planToken) {
      sessionStorage.setItem(PLAN_TOKEN_STORAGE_KEY, planToken);
    }
  }, [planToken]);

  useEffect(() => {
    const token = invitationToken || coachInvitationToken;
    if (token) {
      setIsVerifyingInvitation(true);
      AuthAPI.verifyInvitation(token)
        .then((result) => {
          if (result.valid && result.email) {
            setInvitationEmail(result.email);
            methods.setValue('email', result.email);
          }
        })
        .finally(() => {
          setIsVerifyingInvitation(false);
        });
    }
  }, [invitationToken, coachInvitationToken, methods]);

  // Without these messages a rejected sign-up (e.g. an email that already
  // exists) left the form unchanged, which looked like it was stuck.
  const [submitError, setSubmitError] = useState<
    'exists' | 'failed' | 'login' | null
  >(null);
  const loginMutation = useLoginMutation({
    onSuccess: async () => {
      await initialize();
      navigate(getPath(['dashboard', 'onboarding']));
    },
    onError: () => setSubmitError('login'),
  });
  const createAccountMutation = useCreateAccountMutation({
    onSuccess: async (_, variables) => {
      posthog?.capture('user_signed_up');
      loginMutation.mutate(variables);
    },
    onError: (error) =>
      setSubmitError(
        isAxiosError(error) && error.response?.status === 409
          ? 'exists'
          : 'failed',
      ),
  });

  const { handleSubmit } = methods;

  const onSubmit = handleSubmit(async (data) => {
    setSubmitError(null);
    const submitData = {
      ...data,
      invitationToken: invitationToken || undefined,
      coachInvitationToken: coachInvitationToken || undefined,
    };
    createAccountMutation.mutate(submitData);
  });

  return (
    <FormProvider
      methods={methods}
      onSubmit={onSubmit}
      className={cn('flex flex-col gap-6', className)}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{m.create_an_account()}</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {invitationEmail
            ? m.create_account_from_invitation()
            : m.enter_details_to_create_account()}
        </p>
      </div>
      {isVerifyingInvitation && (
        <p className="text-sm text-muted-foreground text-center">
          {m.verifying_invitation()}
        </p>
      )}
      <div className="grid gap-6">
        <RHFTextField
          name="firstName"
          type="text"
          placeholder={m.first_name_placeholder()}
          label={m.first_name()}
          required
        />
        <RHFTextField
          name="lastName"
          type="text"
          placeholder={m.last_name_placeholder()}
          label={m.last_name()}
          required
        />
        <RHFTextField
          name="email"
          type="email"
          placeholder={m.email_placeholder()}
          label={m.email()}
          required
          disabled={!!invitationEmail}
        />
        <RHFTextField
          name="password"
          type="password"
          required
          label={m.password()}
        />
        {submitError && (
          <p role="alert" className="text-center text-sm text-destructive">
            {submitError === 'exists'
              ? m.signup_email_exists()
              : submitError === 'login'
                ? m.signup_login_failed()
                : m.signup_failed()}{' '}
            {submitError !== 'failed' && (
              <Link to="/auth/login" className="underline underline-offset-4">
                {m.login()}
              </Link>
            )}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          onClick={onSubmit}
          isLoading={
            createAccountMutation.isPending ||
            loginMutation.isPending ||
            isVerifyingInvitation
          }
        >
          {m.create_account()}
        </Button>
        <OAuthButtons
          invitationToken={invitationToken}
          coachInvitationToken={coachInvitationToken}
          redirectTo={getPath(['dashboard'])}
        />
      </div>
      <div className="text-center text-sm">
        {m.already_have_account()}{' '}
        <Link to="/auth/login" className="underline underline-offset-4">
          {m.login()}
        </Link>
      </div>
    </FormProvider>
  );
}
