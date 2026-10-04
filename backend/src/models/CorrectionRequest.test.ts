import { UniqueConstraintError, ValidationError } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureModelsSynced } from './VendorIngestionRecord';
import { CorrectionRequest } from './CorrectionRequest';

const baseRequest = {
  interactionId: 1,
  issueKey: 'rule:unidentified_recruiter',
  raisedByType: 'system' as const,
  raisedBy: 'system',
  reason: 'Recruiter cannot be identified: no email or company recorded',
  openKey: 'rule:unidentified_recruiter',
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

describe('CorrectionRequest', () => {
  it('stores an open request with who raised it, why, and when', async () => {
    const created = await CorrectionRequest.create(baseRequest);

    const stored = await CorrectionRequest.findByPk(created.id);
    expect(stored).not.toBeNull();
    expect(stored!.interactionId).toBe(1);
    expect(stored!.raisedByType).toBe('system');
    expect(stored!.raisedBy).toBe('system');
    expect(stored!.reason).toBe(baseRequest.reason);
    expect(stored!.status).toBe('open');
    expect(stored!.raisedAt).toBeInstanceOf(Date);
  });

  it('records a data reviewer as the raiser by their ID', async () => {
    const created = await CorrectionRequest.create({
      ...baseRequest,
      issueKey: 'reviewer:recruiterCompany',
      openKey: 'reviewer:recruiterCompany',
      raisedByType: 'reviewer',
      raisedBy: 'rev-1',
      reason: 'Company looks like a typo of another vendor',
    });

    expect(created.raisedBy).toBe('rev-1');
  });

  it('rejects a second live request for the same interaction and issue', async () => {
    await CorrectionRequest.create(baseRequest);

    await expect(CorrectionRequest.create(baseRequest)).rejects.toBeInstanceOf(UniqueConstraintError);
    expect(await CorrectionRequest.count()).toBe(1);
  });

  it('still counts an answered request as live for that issue', async () => {
    await CorrectionRequest.create({ ...baseRequest, status: 'answered' });

    await expect(CorrectionRequest.create(baseRequest)).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('allows a different issue, or a different interaction, at the same time', async () => {
    await CorrectionRequest.create(baseRequest);
    await CorrectionRequest.create({ ...baseRequest, issueKey: 'reviewer:recruiterName', openKey: 'reviewer:recruiterName' });
    await CorrectionRequest.create({ ...baseRequest, interactionId: 2 });

    expect(await CorrectionRequest.count()).toBe(3);
  });

  it('allows the same issue to be raised again once the earlier request is closed', async () => {
    const first = await CorrectionRequest.create(baseRequest);
    await first.update({ status: 'closed', openKey: null, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'No longer needed' });

    await CorrectionRequest.create(baseRequest);
    expect(await CorrectionRequest.count({ where: { interactionId: 1 } })).toBe(2);
  });

  it.each([
    ['no reason', { reason: null as unknown as string }],
    ['an empty reason', { reason: '' }],
    ['no raiser', { raisedBy: '' }],
    ['an unknown raiser type', { raisedByType: 'job_seeker' as unknown as 'system' }],
    ['an unknown status', { status: 'pending' as unknown as 'open' }],
  ])('refuses a request with %s', async (_label, override) => {
    await expect(CorrectionRequest.create({ ...baseRequest, ...override })).rejects.toBeInstanceOf(ValidationError);
    expect(await CorrectionRequest.count()).toBe(0);
  });

  it('refuses a live request whose openKey does not match its issue', async () => {
    await expect(CorrectionRequest.create({ ...baseRequest, openKey: null })).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses closing a request without clearing its openKey', async () => {
    const request = await CorrectionRequest.create(baseRequest);

    await expect(request.update({ status: 'closed' })).rejects.toBeInstanceOf(ValidationError);
    await request.reload();
    expect(request.status).toBe('open');
  });

  describe('closing', () => {
    const closing = { status: 'closed' as const, openKey: null, closedBy: 'rev-1', closedAt: new Date() };

    it('records a withdrawal with who, when and why', async () => {
      const request = await CorrectionRequest.create(baseRequest);

      await request.update({ ...closing, closeReason: 'Raised in error' });

      await request.reload();
      expect(request).toMatchObject({ status: 'closed', closedBy: 'rev-1', closeReason: 'Raised in error' });
      expect(request.closedAt).toBeInstanceOf(Date);
    });

    it('records a close by a reviewer decision, linked to that decision', async () => {
      const request = await CorrectionRequest.create(baseRequest);

      await request.update({ ...closing, closedByDecisionId: 7 });

      expect((await CorrectionRequest.findByPk(request.id))!.closedByDecisionId).toBe(7);
    });

    it.each([
      ['without saying who closed it', { closedBy: null, closeReason: 'x' }],
      ['without saying when', { closedAt: null, closeReason: 'x' }],
      ['without a decision or a reason', {}],
      ['with both a decision and a reason', { closedByDecisionId: 7, closeReason: 'x' }],
      ['with an empty reason', { closeReason: '  ' }],
    ])('refuses a close %s', async (_label, override) => {
      const request = await CorrectionRequest.create(baseRequest);

      await expect(request.update({ ...closing, ...override })).rejects.toBeInstanceOf(ValidationError);
      await request.reload();
      expect(request.status).toBe('open');
    });

    it('refuses closing details on a request that is still live', async () => {
      await expect(
        CorrectionRequest.create({ ...baseRequest, closedBy: 'rev-1', closedAt: new Date(), closeReason: 'x' })
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
