import { useCurrentSubscription } from '@/api/subscription';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext, useUserRoles } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { SubscriptionSettingsPage } from '@/pages/dashboard/settings/subscription';
import { m } from '@/paraglide/messages';
import { isPaymentDisabled } from '@/utils/capacitor';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { AccountAdministrationTab } from './account-administration-tab';
import { AiTab } from './ai/ai-tab';
import { AthletesTab } from './athletes-tab';
import { CoachesTab } from './coaches-tab';
import { ConnectorsTab } from './connectors-tab';
import { ContributeTab } from './contribute-tab';
import { EquipmentTab } from './equipment-tab';
import { InvitationsTab } from './invitations-tab';
import { ProfileTab } from './profile-tab';
import { TrainingZonesTab } from './training-zones-tab';

export function SettingsView() {
  const roles = useUserRoles();
  const { user } = useAuthContext();
  const { space } = useSpaceContext();
  const isAthlete = space === 'ATHLETE' && !!roles?.includes('ATHLETE');
  const isCoach = !!roles?.includes('COACH');
  const { data: subscription } = useCurrentSubscription();
  const billingEnabled =
    !!subscription && !subscription.selfHosted && !isPaymentDisabled();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'connectors');

  const allowedTabs = [
    'profile',
    ...(user?.isAdmin ? ['administration'] : []),
    'invitations',
    'contribute',
    ...(billingEnabled ? ['subscription'] : []),
    ...(isAthlete
      ? ['connectors', 'equipment', 'training_zones', 'coaches']
      : []),
    ...(isCoach ? ['athletes'] : []),
    'ai',
  ];
  const tabLabels: Record<string, string> = {
    profile: m.profile(),
    administration: m.account_administration(),
    invitations: m.invitations(),
    contribute: m.contribute(),
    subscription: m.subscription(),
    connectors: m.connectors(),
    equipment: m.equipment(),
    training_zones: m.training_zones(),
    coaches: m.coaches(),
    athletes: m.athletes(),
    ai: m.ai_settings_tab(),
  };
  const visibleTab = allowedTabs.includes(activeTab) ? activeTab : 'profile';
  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  if (isCoach && tabParam === 'training_plan') {
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    return <Navigate to={`/dashboard/planning?${next.toString()}`} replace />;
  }

  return (
    <div className="w-full p-4 md:p-8">
      <h1 className="text-2xl font-semibold hidden md:block">{m.settings()}</h1>
      <Tabs value={visibleTab} onValueChange={handleTabChange} className="mt-4">
        <label className="block md:hidden">
          <span className="sr-only">{m.settings()}</span>
          <select
            data-mobile-settings-select
            className="h-12 w-full rounded-md border bg-background px-3 text-base text-foreground"
            value={visibleTab}
            onChange={(event) => handleTabChange(event.target.value)}
          >
            {allowedTabs.map((tab) => (
              <option key={tab} value={tab}>
                {tabLabels[tab]}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden md:block overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <TabsList className="w-max md:w-auto flex-nowrap md:flex-wrap min-w-full md:min-w-0">
            {isAthlete && (
              <TabsTrigger value="connectors">{m.connectors()}</TabsTrigger>
            )}
            <TabsTrigger value="profile">{m.profile()}</TabsTrigger>
            {user?.isAdmin && (
              <TabsTrigger value="administration">
                {m.account_administration()}
              </TabsTrigger>
            )}
            {isAthlete && (
              <TabsTrigger value="equipment">{m.equipment()}</TabsTrigger>
            )}
            {isAthlete && (
              <TabsTrigger value="training_zones">
                {m.training_zones()}
              </TabsTrigger>
            )}
            <TabsTrigger value="ai">{m.ai_settings_tab()}</TabsTrigger>
            {isCoach && (
              <TabsTrigger value="athletes">{m.athletes()}</TabsTrigger>
            )}
            {isAthlete && (
              <TabsTrigger value="coaches">{m.coaches()}</TabsTrigger>
            )}
            <TabsTrigger value="invitations">{m.invitations()}</TabsTrigger>
            {billingEnabled && (
              <TabsTrigger value="subscription">{m.subscription()}</TabsTrigger>
            )}
            <TabsTrigger value="contribute">{m.contribute()}</TabsTrigger>
          </TabsList>
        </div>
        {isAthlete && (
          <TabsContent value="connectors" className="mt-6">
            <ConnectorsTab />
          </TabsContent>
        )}
        {user?.isAdmin && (
          <TabsContent value="administration" className="mt-6">
            <AccountAdministrationTab />
          </TabsContent>
        )}
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        {isAthlete && (
          <TabsContent value="equipment" className="mt-6">
            <EquipmentTab />
          </TabsContent>
        )}
        {isAthlete && (
          <TabsContent value="training_zones" className="mt-6">
            <TrainingZonesTab />
          </TabsContent>
        )}
        {isCoach && (
          <TabsContent value="athletes" className="mt-6">
            <AthletesTab />
          </TabsContent>
        )}
        {isAthlete && (
          <TabsContent value="coaches" className="mt-6">
            <CoachesTab />
          </TabsContent>
        )}
        <TabsContent value="ai" className="mt-6">
          <AiTab />
        </TabsContent>
        <TabsContent value="invitations" className="mt-6">
          <InvitationsTab />
        </TabsContent>
        {billingEnabled && (
          <TabsContent value="subscription" className="mt-6">
            <SubscriptionSettingsPage />
          </TabsContent>
        )}
        <TabsContent value="contribute" className="mt-6">
          <ContributeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
