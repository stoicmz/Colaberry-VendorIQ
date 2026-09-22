import { sequelize } from '../../config/database';
import { ensureModelsSynced, RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { AttributionReview, AttributionReviewAction } from '../../models/AttributionReview';

export interface ReviewAttributionInput {
  interactionId: number;
  reviewerId: string;
  recruiterName: string;
  recruiterCompany: string | null;
}

export interface ReviewAttributionResult {
  interactionId: number;
  action: AttributionReviewAction;
  recruiterName: string;
  recruiterCompany: string | null;
  reviewedAt: Date;
}

export class MissingReviewerIdError extends Error {
  constructor() {
    super('A reviewer ID is required to submit a review.');
    this.name = 'MissingReviewerIdError';
  }
}

export class InvalidAttributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAttributionError';
  }
}

function normalizeCompany(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Always writes an AttributionReview row, whether or not the submitted attribution
 * differs from what is on file: a reviewer confirming correct attribution is itself
 * the manual-review event REQ-004/REQ-010 ask for, not just a no-op. Re-submitting the
 * same values a second time is safe and expected -- it records that a second review
 * happened, it does not "double-correct" the underlying record.
 */
export async function reviewRecruiterAttribution(
  input: ReviewAttributionInput
): Promise<ReviewAttributionResult | null> {
  const reviewerId = input.reviewerId.trim();
  if (reviewerId === '') {
    throw new MissingReviewerIdError();
  }

  const recruiterName = input.recruiterName.trim();
  if (recruiterName === '') {
    throw new InvalidAttributionError('Recruiter name is required.');
  }

  const recruiterCompany = normalizeCompany(input.recruiterCompany);

  await ensureModelsSynced();

  const record = await RecruiterInteractionRecord.findByPk(input.interactionId);
  if (!record) {
    return null;
  }

  const previousRecruiterName = record.recruiterName;
  const previousRecruiterCompany = record.recruiterCompany;
  const changed = previousRecruiterName !== recruiterName || previousRecruiterCompany !== recruiterCompany;
  const action: AttributionReviewAction = changed ? 'corrected' : 'confirmed';

  const reviewedAt = await sequelize.transaction(async (transaction) => {
    if (changed) {
      await record.update({ recruiterName, recruiterCompany }, { transaction });
    }

    const review = await AttributionReview.create(
      {
        interactionId: input.interactionId,
        reviewerId,
        action,
        previousRecruiterName,
        previousRecruiterCompany,
        newRecruiterName: recruiterName,
        newRecruiterCompany: recruiterCompany,
      },
      { transaction }
    );

    return review.reviewedAt;
  });

  return {
    interactionId: input.interactionId,
    action,
    recruiterName,
    recruiterCompany,
    reviewedAt,
  };
}
