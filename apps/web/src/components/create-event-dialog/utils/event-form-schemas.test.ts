import { describe, expect, it, vi } from 'vitest';

import { NO_EQUIPMENT, withEquipmentId } from './event-form-schemas';

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));

describe('activity equipment', () => {
  it('sends the chosen equipment as an id, or null to detach it', () => {
    expect(withEquipmentId({ name: 'Run', equipment: '12' })).toEqual({
      name: 'Run',
      equipmentId: 12,
    });
    expect(withEquipmentId({ name: 'Run', equipment: NO_EQUIPMENT })).toEqual({
      name: 'Run',
      equipmentId: null,
    });
  });

  it('leaves events without equipment as they are', () => {
    expect(withEquipmentId({ name: 'Intervals' })).toEqual({
      name: 'Intervals',
    });
  });
});
