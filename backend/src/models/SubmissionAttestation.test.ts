import { UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/database';
import { ensureModelsSynced } from './VendorIngestionRecord';
import { SubmissionAttestation } from './SubmissionAttestation';

const baseAttestation = {
  batchId: 1,
  correlationId: 'corr-1',
  attestedBy: 'seeker-ana',
  statement: 'I attest that the recruiter interaction data I am submitting is factual.',
  channel: 'file' as const,
  fileHash: 'a'.repeat(64),
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

describe('SubmissionAttestation', () => {
  it('stores an attestation against its submission with a timestamp', async () => {
    const created = await SubmissionAttestation.create(baseAttestation);

    const stored = await SubmissionAttestation.findByPk(created.id);
    expect(stored).not.toBeNull();
    expect(stored!.batchId).toBe(1);
    expect(stored!.attestedBy).toBe('seeker-ana');
    expect(stored!.statement).toBe(baseAttestation.statement);
    expect(stored!.channel).toBe('file');
    expect(stored!.attestedAt).toBeInstanceOf(Date);
  });

  it('rejects a second attestation by the same person for the same submission', async () => {
    await SubmissionAttestation.create(baseAttestation);

    await expect(
      SubmissionAttestation.create({ ...baseAttestation, correlationId: 'corr-2' })
    ).rejects.toBeInstanceOf(UniqueConstraintError);
    expect(await SubmissionAttestation.count()).toBe(1);
  });

  it('allows a different person to attest the same submission', async () => {
    await SubmissionAttestation.create(baseAttestation);
    await SubmissionAttestation.create({ ...baseAttestation, attestedBy: 'seeker-ben', correlationId: 'corr-2' });

    expect(await SubmissionAttestation.count({ where: { batchId: 1 } })).toBe(2);
  });

  it('refuses an attestation with no attester', async () => {
    await expect(
      SubmissionAttestation.create({ ...baseAttestation, attestedBy: null as unknown as string })
    ).rejects.toThrow();
    expect(await SubmissionAttestation.count()).toBe(0);
  });
});
