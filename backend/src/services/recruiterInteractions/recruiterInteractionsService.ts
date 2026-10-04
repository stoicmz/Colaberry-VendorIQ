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
import { UncertainDataFlag } from '../uncertainData/uncertainDataRules';
import { CurrentInteraction, getCurrentVersions } from '../correctionRequest/currentVersionService';
import { CorrectableField } from '../../models/CorrectionRequest';

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
  // STORY-005: what is uncertain while it waits for a data reviewer; [] when there is nothing
  // to show (certain, or already ruled on); null means the check was unavailable.
  uncertainFlags: UncertainDataFlag[] | null;
  // STORY-011: fields a job seeker's attested correction changed; the values above are current.
  correctedFields: CorrectableField[];
}

export interface InteractionDetail extends InteractionSummary {
  recruiterEmail: string | null;
  channel: string | null;
  notes: string | null;
  // STORY-011: what each corrected field was as originally submitted.
  originalValues: Partial<Record<CorrectableField, string | Date | null>>;
}

// REQ-019: what a job seeker is shown, split so nothing unreviewed can pass as confirmed.
// Rejected interactions appear in neither list -- a reviewer has ruled them out of history.
export interface InteractionHistory {
  confirmed: InteractionSummary[];
  pendingReview: InteractionSummary[];
}

function toSummary(
  record: CurrentInteraction,
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
    uncertainFlags: status.uncertainFlags === undefined ? [] : status.uncertainFlags,
    correctedFields: record.correctedFields,
  };
}

export async function listInteractions(): Promise<InteractionHistory> {
  await ensureModelsSynced();
  const stored = await RecruiterInteractionRecord.findAll({ order: [['interactionDate', 'DESC']] });
  // Sorted on the current date, in case a correction moved an interaction's date.
  const records = (await getCurrentVersions(stored)).sort(
    (a, b) => b.interactionDate.getTime() - a.interactionDate.getTime()
  );
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
  const stored = await RecruiterInteractionRecord.findByPk(id);
  if (!stored) {
    return null;
  }
  const [record] = await getCurrentVersions([stored]);

  await InteractionViewLog.create({ interactionId: record.id });
  const status = (await getHistoryStatuses([record.id])).get(record.id)!;
  const redFlags = await identifyRedFlags([record.id]);

  return {
    ...toSummary(record, status, redFlags),
    recruiterEmail: record.recruiterEmail,
    channel: record.channel,
    notes: record.notes,
    originalValues: record.originalValues,
  };
}
