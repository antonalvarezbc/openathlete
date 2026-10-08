// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EQUIPMENT_TYPE, SPORT_TYPE } from '@openathlete/shared';

import { EquipmentTab } from './equipment-tab';

const equipment = vi.hoisted(() => ({ items: [] as object[] }));
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/api/equipment', () => ({
  useGetMyEquipmentQuery: () => ({ data: equipment.items, isPending: false }),
  useCreateEquipmentMutation: () => mutation,
  useUpdateEquipmentMutation: () => mutation,
  useDeleteEquipmentMutation: () => mutation,
}));
// Every message renders as its key, followed by its parameters.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (params?: Record<string, string>) =>
        [String(key), ...Object.values(params ?? {})].join(' '),
    },
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const item = (equipmentId: number, sports: SPORT_TYPE[]) => ({
  equipmentId,
  name: `Shoe ${equipmentId}`,
  type: EQUIPMENT_TYPE.SHOE,
  totalDistance: 0,
  isDefault: false,
  sports,
});

describe('EquipmentTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const cardSports = () =>
    [...container.querySelectorAll('span')]
      .filter((span) => span.textContent === 'sports')
      .map((label) => label.nextElementSibling?.textContent);

  it('summarises the sports of each piece of equipment', async () => {
    const all = Object.values(SPORT_TYPE);
    equipment.items = [
      item(1, all),
      item(
        2,
        all.filter((sport) => sport !== SPORT_TYPE.MOBILITY),
      ),
      item(3, [SPORT_TYPE.TRAIL_RUNNING, SPORT_TYPE.RUNNING]),
    ];
    await act(async () => root.render(<EquipmentTab />));

    expect(cardSports()).toEqual([
      'all_sports',
      'all_sports_except sport_mobility',
      'sport_trail_running, sport_running',
    ]);
  });
});
