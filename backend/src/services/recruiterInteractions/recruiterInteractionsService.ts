import { RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { InteractionViewLog } from '../../models/InteractionViewLog';

export interface InteractionSummary {
  id: number;
  recruiterName: string;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
}

export interface InteractionDetail extends InteractionSummary {
  recruiterEmail: string | null;
  channel: string | null;
  notes: string | null;
}

function toSummary(record: RecruiterInteractionRecord): InteractionSummary {
  return {
    id: record.id,
    recruiterName: record.recruiterName,
    recruiterCompany: record.recruiterCompany,
    interactionDate: record.interactionDate,
    interactionType: record.interactionType,
  };
}

export async function listInteractions(): Promise<InteractionSummary[]> {
  await ensureModelsSynced();
  const records = await RecruiterInteractionRecord.findAll({ order: [['interactionDate', 'DESC']] });
  return records.map(toSummary);
}

export async function getInteractionById(id: number): Promise<InteractionDetail | null> {
  await ensureModelsSynced();
  const record = await RecruiterInteractionRecord.findByPk(id);
  if (!record) {
    return null;
  }

  await InteractionViewLog.create({ interactionId: record.id });

  return {
    ...toSummary(record),
    recruiterEmail: record.recruiterEmail,
    channel: record.channel,
    notes: record.notes,
  };
}
