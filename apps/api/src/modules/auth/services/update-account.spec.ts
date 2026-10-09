import { updateAccountDtoSchema } from '@openathlete/shared';

// Against the shared build, which the API runs: the time zone check must
// survive bundling
describe('account update', () => {
  it('accepts a known time zone', () => {
    expect(
      updateAccountDtoSchema.safeParse({ timeZone: 'Europe/Paris' }).success,
    ).toBe(true);
  });

  it('refuses an unknown time zone', () => {
    expect(
      updateAccountDtoSchema.safeParse({ timeZone: 'Mars/Olympus_Mons' })
        .success,
    ).toBe(false);
    expect(updateAccountDtoSchema.safeParse({ timeZone: '' }).success).toBe(
      false,
    );
  });
});
