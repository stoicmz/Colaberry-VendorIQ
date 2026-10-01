import { RecruiterInteractionRecord, ensureModelsSynced } from '../../models/VendorIngestionRecord';
import { InteractionViewLog } from '../../models/InteractionViewLog';
import {
  getHistoryStatuses,
  HistoryStatus,
  HistoryStatusInfo,
  HistoryStatusReason,
} from '../historyStatus/historyStatusService';
import { identifyRedFlags } from '../redFlags/redFlagService';
import { RedFlag } from '../redFlags/redFlagRules';

export interface InteractionSummary {
  id: number;
  recruiterName: string;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
  historyStatus: HistoryStatus;
  historyStatusReason: HistoryStatusReason;
  // STORY-004: [] means checked with no red flags; null means the check was unavailable.
  redFlags: RedFlag[] | null;
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

function toSummary(
  record: RecruiterInteractionRecord,
  status: HistoryStatusInfo,
  redFlags: Map<number, RedFlag[]> | null
): InteractionSummary {
  return {
    id: record.id,
    recruiterName: record.recruiterName,
    recruiterCompany: record.recruiterCompany,
    interactionDate: record.interactionDate,
    interactionType: record.interactionType,
    historyStatus: status.status,
    historyStatusReason: status.reason,
    redFlags: redFlags === null ? null : redFlags.get(record.id) ?? [],
  };
}

export async function listInteractions(): Promise<InteractionHistory> {
  await ensureModelsSynced();
  const records = await RecruiterInteractionRecord.findAll({ order: [['interactionDate', 'DESC']] });
  const statuses = await getHistoryStatuses(records.map((record) => record.id));
  const visibleIds = records.filter((record) => statuses.get(record.id)!.status !== 'rejected').map((record) => record.id);
  const redFlags = await identifyRedFlags(visibleIds);

  const history: InteractionHistory = { confirmed: [], pendingReview: [] };
  for (const record of records) {
    const summary = toSummary(record, statuses.get(record.id)!, redFlags);
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
  const redFlags = await identifyRedFlags([record.id]);

  return {
    ...toSummary(record, status, redFlags),
    recruiterEmail: record.recruiterEmail,
    channel: record.channel,
    notes: record.notes,
  };
}
