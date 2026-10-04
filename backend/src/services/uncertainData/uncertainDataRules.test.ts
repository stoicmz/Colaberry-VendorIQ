import { detectUncertainData, UncertainDataInteraction, UncertainDataRuleId } from './uncertainDataRules';

let nextId = 1;

function interaction(overrides: Partial<UncertainDataInteraction> = {}): UncertainDataInteraction {
  return {
    id: nextId++,
    batchId: 1,
    submittedAt: new Date('2026-09-20T15:00:00Z'),
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@acme.com',
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-09-01T00:00:00Z'),
    interactionType: 'email',
    ...overrides,
  };
}

function ruleIdsFor(target: UncertainDataInteraction, all: UncertainDataInteraction[] = [target]): UncertainDataRuleId[] {
  return detectUncertainData(all).get(target.id)!.map((flag) => flag.ruleId);
}

describe('U1 unidentified_recruiter', () => {
  it('flags a record with only a name', () => {
    const target = interaction({ recruiterEmail: null, recruiterCompany: null });
    expect(detectUncertainData([target]).get(target.id)).toEqual([
      expect.objectContaining({ ruleId: 'unidentified_recruiter', evidence: 'Only a name is recorded: Jane Doe' }),
    ]);
  });

  it('flags a record whose email and company are blank', () => {
    expect(ruleIdsFor(interaction({ recruiterEmail: '  ', recruiterCompany: '  ' }))).toContain('unidentified_recruiter');
  });

  it.each([
    ['an email only', { recruiterCompany: null }],
    ['a company only', { recruiterEmail: null }],
    ['an email and a blank company', { recruiterCompany: '  ' }],
  ])('does not flag a record with %s', (_label, overrides) => {
    expect(ruleIdsFor(interaction(overrides))).not.toContain('unidentified_recruiter');
  });
});

describe('U2 date_after_submission', () => {
  it('flags an interaction dated two days after it was submitted', () => {
    const target = interaction({ interactionDate: new Date('2026-09-22T00:00:00Z') });
    expect(detectUncertainData([target]).get(target.id)).toEqual([
      expect.objectContaining({ ruleId: 'date_after_submission', evidence: 'Dated 2026-09-22, submitted 2026-09-20' }),
    ]);
  });

  it.each([
    ['the same day', '2026-09-20T00:00:00Z'],
    ['one day later (timezone leeway)', '2026-09-21T00:00:00Z'],
    ['an earlier day', '2026-09-01T00:00:00Z'],
  ])('does not flag an interaction dated %s', (_label, date) => {
    expect(ruleIdsFor(interaction({ interactionDate: new Date(date) }))).not.toContain('date_after_submission');
  });
});

describe('U3 possible_duplicate', () => {
  it('flags both records when the same interaction arrives in two submissions', () => {
    const first = interaction({ batchId: 1 });
    const second = interaction({ batchId: 2 });
    const flags = detectUncertainData([first, second]);
    expect(flags.get(first.id)).toEqual([
      expect.objectContaining({ ruleId: 'possible_duplicate', evidence: `Matches interaction #${second.id} (email on 2026-09-01)` }),
    ]);
    expect(flags.get(second.id)).toEqual([
      expect.objectContaining({ ruleId: 'possible_duplicate', evidence: `Matches interaction #${first.id} (email on 2026-09-01)` }),
    ]);
  });

  it('matches by name when the records have no email', () => {
    const first = interaction({ batchId: 1, recruiterEmail: null });
    const second = interaction({ batchId: 2, recruiterEmail: null, recruiterName: ' jane doe ' });
    expect(ruleIdsFor(first, [first, second])).toContain('possible_duplicate');
  });

  it.each([
    ['in the same submission', { batchId: 1 }],
    ['on a different day', { batchId: 2, interactionDate: new Date('2026-09-02T00:00:00Z') }],
    ['of a different type', { batchId: 2, interactionType: 'call' }],
    ['from a different email with the same name', { batchId: 2, recruiterEmail: 'jane@beta.com' }],
  ])('does not flag a match %s', (_label, overrides) => {
    const first = interaction({ batchId: 1 });
    const other = interaction(overrides);
    expect(ruleIdsFor(first, [first, other])).not.toContain('possible_duplicate');
  });
});

describe('U4 email_multiple_names', () => {
  it('flags both records when one email is recorded under two names', () => {
    const jane = interaction({ recruiterName: 'Jane Doe' });
    const john = interaction({ recruiterName: 'John Roe', interactionDate: new Date('2026-09-05T00:00:00Z') });
    const flags = detectUncertainData([jane, john]);
    expect(flags.get(jane.id)).toEqual([
      expect.objectContaining({ ruleId: 'email_multiple_names', evidence: 'jane@acme.com is also recorded as: John Roe' }),
    ]);
    expect(flags.get(john.id)).toEqual([
      expect.objectContaining({ ruleId: 'email_multiple_names', evidence: 'jane@acme.com is also recorded as: Jane Doe' }),
    ]);
  });

  it('does not flag the same name written with different case or spacing', () => {
    const a = interaction({ recruiterName: 'Jane Doe' });
    const b = interaction({ recruiterName: ' jane doe ', interactionDate: new Date('2026-09-05T00:00:00Z') });
    expect(ruleIdsFor(a, [a, b])).not.toContain('email_multiple_names');
  });

  it('gives identical evidence whatever order the records arrive in', () => {
    const jane = interaction({ recruiterName: 'Jane Doe' });
    const zed = interaction({ recruiterName: 'Zed Park', interactionDate: new Date('2026-09-03T00:00:00Z') });
    const bob = interaction({ recruiterName: 'bob lee', interactionDate: new Date('2026-09-04T00:00:00Z') });
    const bobUpper = interaction({ recruiterName: 'Bob Lee', interactionDate: new Date('2026-09-05T00:00:00Z') });
    const forward = detectUncertainData([jane, zed, bob, bobUpper]);
    const reversed = detectUncertainData([bobUpper, bob, zed, jane]);

    expect(reversed.get(jane.id)).toEqual(forward.get(jane.id));
    expect(forward.get(jane.id)![0].evidence).toBe('jane@acme.com is also recorded as: bob lee, Zed Park');
  });
});

describe('certain data', () => {
  it('returns an empty list for an ordinary interaction, and an entry for every id', () => {
    const a = interaction();
    const b = interaction({ interactionType: 'call', interactionDate: new Date('2026-09-02T00:00:00Z') });
    const flags = detectUncertainData([a, b]);
    expect([...flags.keys()]).toEqual([a.id, b.id]);
    expect(flags.get(a.id)).toEqual([]);
    expect(flags.get(b.id)).toEqual([]);
  });

  it('returns an empty map for no interactions', () => {
    expect(detectUncertainData([]).size).toBe(0);
  });
});
