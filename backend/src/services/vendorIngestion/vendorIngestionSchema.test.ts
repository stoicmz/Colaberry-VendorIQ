import { recruiterInteractionSchema } from './vendorIngestionSchema';

describe('recruiterInteractionSchema', () => {
  const validRecord = {
    recruiterName: 'Jane Doe',
    recruiterEmail: 'Jane.Doe@Example.com',
    recruiterCompany: 'Acme Staffing',
    interactionDate: '2026-08-01',
    interactionType: 'email',
    channel: 'LinkedIn',
    notes: 'Reached out about a backend role.',
  };

  it('accepts a fully-populated valid record', () => {
    const result = recruiterInteractionSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('accepts a record with only the required fields', () => {
    const result = recruiterInteractionSchema.safeParse({
      recruiterName: 'Jane Doe',
      interactionDate: '2026-08-01',
    });
    expect(result.success).toBe(true);
  });

  it('trims and lowercases the recruiter email', () => {
    const result = recruiterInteractionSchema.safeParse(validRecord);
    expect(result.success && result.data.recruiterEmail).toBe('jane.doe@example.com');
  });

  it('trims the recruiter name', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      recruiterName: '  Jane Doe  ',
    });
    expect(result.success && result.data.recruiterName).toBe('Jane Doe');
  });

  it('coerces a date string to a Date', () => {
    const result = recruiterInteractionSchema.safeParse(validRecord);
    expect(result.success && result.data.interactionDate).toBeInstanceOf(Date);
  });

  it('defaults interactionType to "other" when omitted', () => {
    const { interactionType, ...rest } = validRecord;
    const result = recruiterInteractionSchema.safeParse(rest);
    expect(result.success && result.data.interactionType).toBe('other');
  });

  it('rejects a missing recruiterName', () => {
    const { recruiterName, ...rest } = validRecord;
    const result = recruiterInteractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a blank recruiterName', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      recruiterName: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized recruiterName', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      recruiterName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed recruiterEmail', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      recruiterEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing interactionDate', () => {
    const { interactionDate, ...rest } = validRecord;
    const result = recruiterInteractionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an unparseable interactionDate', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      interactionDate: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an interactionType outside the known enum', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      interactionType: 'carrier-pigeon',
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes exceeding the max length', () => {
    const result = recruiterInteractionSchema.safeParse({
      ...validRecord,
      notes: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
