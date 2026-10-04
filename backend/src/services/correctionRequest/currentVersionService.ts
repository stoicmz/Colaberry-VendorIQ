import { Transaction } from 'sequelize';
import { RecruiterInteractionRecord } from '../../models/VendorIngestionRecord';
import { CORRECTABLE_FIELDS, CorrectableField } from '../../models/CorrectionRequest';
import { CorrectionResponse } from '../../models/CorrectionResponse';

/**
 * An interaction as it stands now: the stored row with every attested correction laid over it.
 * correctedFields lists the fields a correction changed ([] when none), and originalValues
 * holds what those fields were in the stored row, so screens can show both.
 */
export interface CurrentInteraction {
  id: number;
  batchId: number;
  recruiterName: string;
  recruiterEmail: string | null;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
  channel: string | null;
  notes: string | null;
  createdAt: Date;
  correctedFields: CorrectableField[];
  originalValues: Partial<Record<CorrectableField, string | Date | null>>;
}

/**
 * Works out the current version of each interaction (REQ-010). The stored row is never changed:
 * a job seeker's 'corrected' answers are applied on read, oldest first, so the latest correction
 * to a field wins and every earlier value stays in the CorrectionResponse log. A correction
 * counts as soon as it is answered -- the interaction is still pending review then, so nothing
 * unconfirmed is shown as confirmed. Returns the records in the order given.
 * Pass a transaction when the caller reads inside one.
 */
export async function getCurrentVersions(
  records: RecruiterInteractionRecord[],
  options: { transaction?: Transaction } = {}
): Promise<CurrentInteraction[]> {
  if (records.length === 0) {
    return [];
  }

  const corrections = await CorrectionResponse.findAll({
    where: { interactionId: records.map((record) => record.id), answer: 'corrected' },
    attributes: ['id', 'interactionId', 'correctedValues'],
    order: [['id', 'ASC']],
    transaction: options.transaction,
  });
  const byInteraction = new Map<number, CorrectionResponse[]>();
  for (const correction of corrections) {
    const list = byInteraction.get(correction.interactionId) ?? [];
    list.push(correction);
    byInteraction.set(correction.interactionId, list);
  }

  return records.map((record) => {
    const current: CurrentInteraction = {
      id: record.id,
      batchId: record.batchId,
      recruiterName: record.recruiterName,
      recruiterEmail: record.recruiterEmail,
      recruiterCompany: record.recruiterCompany,
      interactionDate: record.interactionDate,
      interactionType: record.interactionType,
      channel: record.channel,
      notes: record.notes,
      createdAt: record.createdAt,
      correctedFields: [],
      originalValues: {},
    };
    for (const correction of byInteraction.get(record.id) ?? []) {
      // The model only stores a non-empty JSON object here; anything else is corruption and must surface.
      const values = JSON.parse(correction.correctedValues!) as Record<string, string>;
      for (const [field, value] of Object.entries(values)) {
        if (!(CORRECTABLE_FIELDS as readonly string[]).includes(field)) {
          throw new Error(`Correction ${correction.id} holds a field that cannot be corrected: ${field}`);
        }
        const key = field as CorrectableField;
        if (!current.correctedFields.includes(key)) {
          current.correctedFields.push(key);
          current.originalValues[key] = record[key];
        }
        if (key === 'interactionDate') {
          current.interactionDate = new Date(value);
        } else {
          current[key] = value;
        }
      }
    }
    return current;
  });
}
