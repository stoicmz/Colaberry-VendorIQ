import { detectRedFlags, RedFlagInteraction, RedFlagRuleId } from './redFlagRules';

let nextId = 1;

function interaction(overrides: Partial<RedFlagInteraction> = {}): RedFlagInteraction {
  return {
    id: nextId++,
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@acme.com',
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-09-01T12:00:00Z'),
    interactionType: 'email',
    notes: 'Discussed the backend role.',
    ...overrides,
  };
}

function ruleIdsFor(target: RedFlagInteraction, all: RedFlagInteraction[] = [target]): RedFlagRuleId[] {
  return detectRedFlags(all).get(target.id)!.map((flag) => flag.ruleId);
}

describe('R1 money_or_personal_data', () => {
  it.each([
    ['There is an upfront fee for onboarding.', '"upfront", "fee"'],
    ['Send your SSN before the call.', '"ssn"'],
    ['They asked me to buy gift cards.', '"gift cards"'],
    ['You must pay  for training first.', '"pay for training"'],
    ['A fee is due. The Fee is refundable.', '"fee"'],
  ])('flags %j with evidence %s', (notes, evidence) => {
    const target = interaction({ notes });
    const flags = detectRedFlags([target]).get(target.id)!;
    expect(flags).toEqual([expect.objectContaining({ ruleId: 'money_or_personal_data', evidence })]);
  });

  it.each([['Thanks for the feedback.'], ['Met for coffee.'], ['Scheduled a deposition.'], [null]])(
    'does not flag %j',
    (notes) => {
      expect(ruleIdsFor(interaction({ notes }))).not.toContain('money_or_personal_data');
    }
  );
});

describe('R2 personal_email_domain', () => {
  it.each([['jane@gmail.com'], ['jane@Gmail.COM']])('flags %s while representing a company', (recruiterEmail) => {
    const target = interaction({ recruiterEmail });
    const flags = detectRedFlags([target]).get(target.id)!;
    expect(flags).toEqual([
      expect.objectContaining({ ruleId: 'personal_email_domain', evidence: 'gmail.com, representing Acme' }),
    ]);
  });

  it.each([
    ['gmail with no company', { recruiterEmail: 'jane@gmail.com', recruiterCompany: null }],
    ['gmail with a blank company', { recruiterEmail: 'jane@gmail.com', recruiterCompany: '  ' }],
    ['a corporate domain', { recruiterEmail: 'jane@acme.com' }],
    ['no email', { recruiterEmail: null }],
  ])('does not flag %s', (_label, overrides) => {
    expect(ruleIdsFor(interaction(overrides))).not.toContain('personal_email_domain');
  });
});

describe('R3 email_multiple_companies', () => {
  it('flags both records when one email appears under two companies', () => {
    const acme = interaction({ recruiterCompany: 'Acme' });
    const beta = interaction({ recruiterCompany: 'Beta LLC' });
    const flags = detectRedFlags([acme, beta]);
    expect(flags.get(acme.id)).toEqual([
      expect.objectContaining({ ruleId: 'email_multiple_companies', evidence: 'jane@acme.com also recorded under: Beta LLC' }),
    ]);
    expect(flags.get(beta.id)).toEqual([
      expect.objectContaining({ ruleId: 'email_multiple_companies', evidence: 'jane@acme.com also recorded under: Acme' }),
    ]);
  });

  it('gives identical evidence whatever order the records arrive in, so the audit log is not duplicated', () => {
    const acme = interaction({ recruiterCompany: 'Acme' });
    const zeta = interaction({ recruiterCompany: 'Zeta Corp' });
    const betaLower = interaction({ recruiterCompany: 'beta llc' });
    const betaUpper = interaction({ recruiterCompany: 'Beta LLC' });
    const forward = detectRedFlags([acme, zeta, betaLower, betaUpper]);
    const reversed = detectRedFlags([betaUpper, betaLower, zeta, acme]);

    expect(reversed.get(acme.id)).toEqual(forward.get(acme.id));
    // Sorted, with the earliest spelling of a company kept.
    expect(forward.get(acme.id)![0].evidence).toBe('jane@acme.com also recorded under: beta llc, Zeta Corp');
  });

  it('does not flag the same company written with different case or spacing', () => {
    const a = interaction({ recruiterCompany: 'Acme' });
    const b = interaction({ recruiterCompany: ' acme ', recruiterEmail: 'JANE@acme.com' });
    expect(ruleIdsFor(a, [a, b])).not.toContain('email_multiple_companies');
    expect(ruleIdsFor(b, [a, b])).not.toContain('email_multiple_companies');
  });

  it('does not flag a record with no company', () => {
    const a = interaction({ recruiterCompany: 'Acme' });
    const b = interaction({ recruiterCompany: null });
    expect(ruleIdsFor(a, [a, b])).not.toContain('email_multiple_companies');
    expect(ruleIdsFor(b, [a, b])).not.toContain('email_multiple_companies');
  });
});

describe('R4 offer_without_interview', () => {
  const offerDate = new Date('2026-09-10T12:00:00Z');

  it('flags an offer with no interview on record', () => {
    const offer = interaction({ interactionType: 'offer', interactionDate: offerDate });
    const flags = detectRedFlags([offer]).get(offer.id)!;
    expect(flags).toEqual([
      expect.objectContaining({
        ruleId: 'offer_without_interview',
        evidence: 'No interview with Jane Doe on or before 2026-09-10',
      }),
    ]);
  });

  it('flags an offer whose only interview came later', () => {
    const offer = interaction({ interactionType: 'offer', interactionDate: offerDate });
    const later = interaction({ interactionType: 'interview', interactionDate: new Date('2026-09-12T12:00:00Z') });
    expect(ruleIdsFor(offer, [offer, later])).toContain('offer_without_interview');
  });

  it.each([
    ['an earlier interview matched by email', { recruiterName: 'J. Doe', interactionDate: new Date('2026-09-05T12:00:00Z') }],
    ['an earlier interview matched by name', { recruiterEmail: null, interactionDate: new Date('2026-09-05T12:00:00Z') }],
    ['a same-day interview', { interactionDate: offerDate }],
    // The offer is at 12:00 UTC; the interview is later the same day.
    ['a same-day interview later in the day', { interactionDate: new Date('2026-09-10T15:00:00Z') }],
  ])('does not flag an offer with %s', (_label, overrides) => {
    const offer = interaction({ interactionType: 'offer', interactionDate: offerDate });
    const interview = interaction({ interactionType: 'interview', ...overrides });
    expect(ruleIdsFor(offer, [offer, interview])).not.toContain('offer_without_interview');
  });

  it('never applies to interactions that are not offers', () => {
    expect(ruleIdsFor(interaction({ interactionType: 'call' }))).not.toContain('offer_without_interview');
  });
});

describe('clean data', () => {
  it('returns an empty list for an ordinary interaction, and an entry for every id', () => {
    const a = interaction();
    const b = interaction({ interactionType: 'call', notes: null });
    const flags = detectRedFlags([a, b]);
    expect([...flags.keys()]).toEqual([a.id, b.id]);
    expect(flags.get(a.id)).toEqual([]);
    expect(flags.get(b.id)).toEqual([]);
  });

  it('returns an empty map for no interactions', () => {
    expect(detectRedFlags([]).size).toBe(0);
  });
});
