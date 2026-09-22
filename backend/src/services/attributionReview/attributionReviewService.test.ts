import { sequelize } from '../../config/database';
import { IngestionBatch, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { AttributionReview } from '../../models/AttributionReview';
import {
  InvalidAttributionError,
  MissingReviewerIdError,
  reviewRecruiterAttribution,
} from './attributionReviewService';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

async function seedInteraction(): Promise<number> {
  const batch = await IngestionBatch.create({
    fileHash: `hash-${Date.now()}-${Math.random()}`,
    fileName: 'interactions.csv',
    totalRows: 1,
    validCount: 1,
    errorCount: 0,
  });
  const record = await RecruiterInteractionRecord.create({
    batchId: batch.id,
    recruiterName: 'Jane Doe',
    recruiterEmail: 'jane@example.com',
    recruiterCompany: 'Acme Corp',
    interactionDate: new Date('2026-08-01'),
    interactionType: 'email',
    channel: 'email',
    notes: 'Initial outreach',
  });
  return record.id;
}

describe('reviewRecruiterAttribution', () => {
  it('confirms accurate attribution without changing the record, and logs the confirmation', async () => {
    const id = await seedInteraction();

    const result = await reviewRecruiterAttribution({
      interactionId: id,
      reviewerId: 'reviewer-1',
      recruiterName: 'Jane Doe',
      recruiterCompany: 'Acme Corp',
    });

    expect(result).toEqual({
      interactionId: id,
      action: 'confirmed',
      recruiterName: 'Jane Doe',
      recruiterCompany: 'Acme Corp',
      reviewedAt: expect.any(Date),
    });

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Jane Doe');

    const logs = await AttributionReview.findAll({ where: { interactionId: id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('confirmed');
    expect(logs[0].reviewerId).toBe('reviewer-1');
    expect(logs[0].previousRecruiterName).toBe('Jane Doe');
    expect(logs[0].newRecruiterName).toBe('Jane Doe');
  });

  it('corrects incorrect attribution, updates the record, and logs the correction with the reviewer ID and timestamp', async () => {
    const id = await seedInteraction();

    const result = await reviewRecruiterAttribution({
      interactionId: id,
      reviewerId: 'reviewer-42',
      recruiterName: 'Janet Doe',
      recruiterCompany: 'Acme Corporation',
    });

    expect(result?.action).toBe('corrected');

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Janet Doe');
    expect(record?.recruiterCompany).toBe('Acme Corporation');

    const logs = await AttributionReview.findAll({ where: { interactionId: id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('corrected');
    expect(logs[0].reviewerId).toBe('reviewer-42');
    expect(logs[0].previousRecruiterName).toBe('Jane Doe');
    expect(logs[0].previousRecruiterCompany).toBe('Acme Corp');
    expect(logs[0].newRecruiterName).toBe('Janet Doe');
    expect(logs[0].newRecruiterCompany).toBe('Acme Corporation');
    expect(logs[0].reviewedAt).toBeInstanceOf(Date);
  });

  it('clears the company to null when the reviewer submits an empty company', async () => {
    const id = await seedInteraction();

    const result = await reviewRecruiterAttribution({
      interactionId: id,
      reviewerId: 'reviewer-1',
      recruiterName: 'Jane Doe',
      recruiterCompany: '',
    });

    expect(result?.recruiterCompany).toBeNull();
    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterCompany).toBeNull();
  });

  it('returns null for an interaction that does not exist, without writing a review log', async () => {
    const result = await reviewRecruiterAttribution({
      interactionId: 999999,
      reviewerId: 'reviewer-1',
      recruiterName: 'Jane Doe',
      recruiterCompany: 'Acme Corp',
    });

    expect(result).toBeNull();
    expect(await AttributionReview.count()).toBe(0);
  });

  it('rejects a review with a missing reviewer ID, and does not modify the record', async () => {
    const id = await seedInteraction();

    await expect(
      reviewRecruiterAttribution({
        interactionId: id,
        reviewerId: '   ',
        recruiterName: 'Janet Doe',
        recruiterCompany: 'Acme Corp',
      })
    ).rejects.toThrow(MissingReviewerIdError);

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Jane Doe');
    expect(await AttributionReview.count()).toBe(0);
  });

  it('rejects a review with an empty recruiter name, and does not modify the record', async () => {
    const id = await seedInteraction();

    await expect(
      reviewRecruiterAttribution({
        interactionId: id,
        reviewerId: 'reviewer-1',
        recruiterName: '   ',
        recruiterCompany: 'Acme Corp',
      })
    ).rejects.toThrow(InvalidAttributionError);

    const record = await RecruiterInteractionRecord.findByPk(id);
    expect(record?.recruiterName).toBe('Jane Doe');
    expect(await AttributionReview.count()).toBe(0);
  });
});
