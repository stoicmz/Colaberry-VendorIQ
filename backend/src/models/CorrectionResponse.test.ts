import { UniqueConstraintError, ValidationError } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureModelsSynced } from './VendorIngestionRecord';
import { CorrectionResponse } from './CorrectionResponse';

const correction = {
  requestId: 1,
  interactionId: 1,
  answer: 'corrected' as const,
  correctedValues: JSON.stringify({ recruiterCompany: 'Acme Staffing' }),
  reason: 'I found the company on the email signature',
  respondedBy: 'seeker-ana',
  statement: 'I attest that this correction is factual to the best of my knowledge.',
};

beforeAll(async () => {
  // Proves the model is registered with the shared sync, not just importable on its own.
  await ensureModelsSynced();
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('CorrectionResponse', () => {
  it('stores a correction with its new values, reason, responder, attestation and time', async () => {
    const created = await CorrectionResponse.create(correction);

    const stored = await CorrectionResponse.findByPk(created.id);
    expect(stored).not.toBeNull();
    expect(stored!.answer).toBe('corrected');
    expect(JSON.parse(stored!.correctedValues!)).toEqual({ recruiterCompany: 'Acme Staffing' });
    expect(stored!.reason).toBe(correction.reason);
    expect(stored!.respondedBy).toBe('seeker-ana');
    expect(stored!.statement).toBe(correction.statement);
    expect(stored!.respondedAt).toBeInstanceOf(Date);
  });

  it.each(['confirmed_as_is', 'unavailable'] as const)('stores the answer %s with no new values', async (answer) => {
    const created = await CorrectionResponse.create({ ...correction, answer, correctedValues: null });

    expect(created.correctedValues).toBeNull();
  });

  it('rejects a second answer to the same request', async () => {
    await CorrectionResponse.create(correction);

    await expect(
      CorrectionResponse.create({ ...correction, answer: 'unavailable', correctedValues: null })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
    expect(await CorrectionResponse.count()).toBe(1);
  });

  it.each([
    ['a correction with no values', { correctedValues: null }],
    ['a correction with an empty set of values', { correctedValues: '{}' }],
    ['a correction whose values are not a JSON object', { correctedValues: '["Acme"]' }],
    ['a correction whose values are not JSON', { correctedValues: 'Acme' }],
    ['a confirmation that carries values', { answer: 'confirmed_as_is' as const }],
    ['an unavailable answer that carries values', { answer: 'unavailable' as const }],
    ['an unknown answer', { answer: 'maybe' as unknown as 'corrected' }],
    ['an answer with no reason', { reason: '' }],
    ['an answer with no responder', { respondedBy: '' }],
    ['an answer with no attestation statement', { statement: '' }],
  ])('refuses %s', async (_label, override) => {
    await expect(CorrectionResponse.create({ ...correction, ...override })).rejects.toBeInstanceOf(ValidationError);
    expect(await CorrectionResponse.count()).toBe(0);
  });
});
