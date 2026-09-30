import { RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { InteractionViewLog } from '../../models/InteractionViewLog';
import {
  getHistoryStatuses,
  HistoryStatus,
  HistoryStatusInfo,
  HistoryStatusReason,
} from '../historyStatus/historyStatusService';

export interface InteractionSummary {
  id: number;
  recruiterName: string;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
  historyStatus: HistoryStatus;
  historyStatusReason: HistoryStatusReason;
}

export interface InteractionDetail extends InteractionSummary {
  recruiterEmail: string | null;
  channel: string | null;
  notes: string | null;
}

// REQ-019: what a job seeker is shown, split so nothing unreviewed can pass as confirmed.
// Rejected interactions appear in neither list -- a reviewer has ruled them out of history.
export interface InteractionHistory {
  confirmed: InteractionSummary[];
  pendingReview: InteractionSummary[];
}

function toSummary(record: RecruiterInteractionRecord, status: HistoryStatusInfo): InteractionSummary {
  return {
    id: record.id,
    recruiterName: record.recruiterName,
    recruiterCompany: record.recruiterCompany,
    interactionDate: record.interactionDate,
    interactionType: record.interactionType,
    historyStatus: status.status,
    historyStatusReason: status.reason,
  };
}

export async function listInteractions(): Promise<InteractionHistory> {
  await ensureModelsSynced();
  const records = await RecruiterInteractionRecord.findAll({ order: [['interactionDate', 'DESC']] });
  const statuses = await getHistoryStatuses(records.map((record) => record.id));

  const history: InteractionHistory = { confirmed: [], pendingReview: [] };
  for (const record of records) {
    const summary = toSummary(record, statuses.get(record.id)!);
    if (summary.historyStatus === 'confirmed') {
      history.confirmed.push(summary);
    } else if (summary.historyStatus === 'pending_review') {
      history.pendingReview.push(summary);
    }
  }
  return history;
}

export async function getInteractionById(id: number): Promise<InteractionDetail | null> {
  await ensureModelsSynced();
  const record = await RecruiterInteractionRecord.findByPk(id);
  if (!record) {
    return null;
  }

  await InteractionViewLog.create({ interactionId: record.id });
  const status = (await getHistoryStatuses([record.id])).get(record.id)!;

  return {
    ...toSummary(record, status),
    recruiterEmail: record.recruiterEmail,
    channel: record.channel,
    notes: record.notes,
  };
}
