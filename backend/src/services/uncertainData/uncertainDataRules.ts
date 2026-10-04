/**
 * STORY-005 / REQ-005: fixed, factual rules that flag uncertain data for manual review.
 *
 * These are about the data's quality -- can we tell who this was, is the date possible, was it
 * submitted twice -- not about the recruiter's behaviour (that is STORY-004's red flags). Each
 * rule states a checkable fact and quotes its evidence; none makes an automated judgment.
 * A flagged interaction waits for a data reviewer before it counts as confirmed history.
 */

// Bump when a rule's logic or wording changes, so the audit log shows which rules raised a flag.
export const UNCERTAIN_DATA_RULES_VERSION = 1;

export type UncertainDataRuleId =
  | 'unidentified_recruiter' // U1
  | 'date_after_submission' // U2
  | 'possible_duplicate' // U3
  | 'email_multiple_names'; // U4

export interface UncertainDataFlag {
  ruleId: UncertainDataRuleId;
  description: string; // what is uncertain, in plain language
  evidence: string; // the exact fields that triggered it
}

export interface UncertainDataInteraction {
  id: number;
  batchId: number; // the submission (upload) it arrived in
  submittedAt: Date; // when that submission was ingested
  recruiterName: string;
  recruiterEmail: string | null;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// UTC calendar day, e.g. "2026-09-10" -- the same day comparison the STORY-004 rules use.
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return calendarDay(date);
}

// Same email when both records have one; otherwise the same name.
function sameRecruiter(a: UncertainDataInteraction, b: UncertainDataInteraction): boolean {
  if (a.recruiterEmail && b.recruiterEmail) {
    return normalize(a.recruiterEmail) === normalize(b.recruiterEmail);
  }
  return normalize(a.recruiterName) === normalize(b.recruiterName);
}

// U1. With no email and no company there is nothing to tell two "Jane Doe"s apart.
function checkUnidentifiedRecruiter(i: UncertainDataInteraction): UncertainDataFlag | null {
  if (i.recruiterEmail?.trim() || i.recruiterCompany?.trim()) return null;
  return {
    ruleId: 'unidentified_recruiter',
    description: 'Recruiter cannot be identified: no email or company recorded',
    evidence: `Only a name is recorded: ${i.recruiterName}`,
  };
}

// U2. One day of grace, because "today" differs by timezone: a job seeker ahead of UTC can
// submit an interaction dated their today while it is still yesterday in UTC.
function checkDateAfterSubmission(i: UncertainDataInteraction): UncertainDataFlag | null {
  const interactionDay = calendarDay(i.interactionDate);
  const submittedDay = calendarDay(i.submittedAt);
  if (interactionDay <= addDays(submittedDay, 1)) return null;
  return {
    ruleId: 'date_after_submission',
    description: 'Interaction is dated after it was submitted',
    evidence: `Dated ${interactionDay}, submitted ${submittedDay}`,
  };
}

// U3. Only across different submissions: two calls on one day in the same file can be real,
// but the same interaction arriving in a second upload is likely counted twice.
function checkPossibleDuplicate(i: UncertainDataInteraction, all: UncertainDataInteraction[]): UncertainDataFlag | null {
  const day = calendarDay(i.interactionDate);
  const matches = all
    .filter(
      (o) =>
        o.id !== i.id &&
        o.batchId !== i.batchId &&
        o.interactionType === i.interactionType &&
        calendarDay(o.interactionDate) === day &&
        sameRecruiter(o, i)
    )
    .map((o) => o.id)
    .sort((a, b) => a - b);
  if (matches.length === 0) return null;
  return {
    ruleId: 'possible_duplicate',
    description: 'Possible duplicate: same recruiter, day and type in another submission',
    evidence: `Matches interaction ${matches.map((id) => `#${id}`).join(', ')} (${i.interactionType} on ${day})`,
  };
}

interface NameSpelling {
  id: number; // the interaction it came from, so the earliest spelling can win
  display: string;
}

// U4. One email recorded under different names: we cannot tell whose interaction this is.
function checkEmailMultipleNames(
  i: UncertainDataInteraction,
  namesByEmail: Map<string, Map<string, NameSpelling>>
): UncertainDataFlag | null {
  if (!i.recruiterEmail?.trim()) return null;
  const others = [...(namesByEmail.get(normalize(i.recruiterEmail)) ?? new Map<string, NameSpelling>()).entries()]
    .filter(([key]) => key !== normalize(i.recruiterName))
    .map(([, spelling]) => spelling.display)
    // Sorted so the evidence text -- and its audit hash -- never depends on row order.
    .sort((a, b) => a.localeCompare(b));
  if (others.length === 0) return null;
  return {
    ruleId: 'email_multiple_names',
    description: 'The same email is recorded under different recruiter names',
    evidence: `${normalize(i.recruiterEmail)} is also recorded as: ${others.join(', ')}`,
  };
}

/**
 * Runs every rule over a set of interactions. U3 and U4 compare records with each other, so
 * pass every interaction. Every id gets an entry; an empty array means "checked, certain".
 */
export function detectUncertainData(interactions: UncertainDataInteraction[]): Map<number, UncertainDataFlag[]> {
  const namesByEmail = new Map<string, Map<string, NameSpelling>>(); // email -> (normalized name -> spelling)
  for (const i of interactions) {
    if (!i.recruiterEmail?.trim()) continue;
    const email = normalize(i.recruiterEmail);
    if (!namesByEmail.has(email)) namesByEmail.set(email, new Map());
    const names = namesByEmail.get(email)!;
    const key = normalize(i.recruiterName);
    // Keep the lowest-id spelling, so the evidence stays the same whatever the row order.
    const existing = names.get(key);
    if (existing === undefined || i.id < existing.id) {
      names.set(key, { id: i.id, display: i.recruiterName.trim() });
    }
  }

  const result = new Map<number, UncertainDataFlag[]>();
  for (const i of interactions) {
    const flags = [
      checkUnidentifiedRecruiter(i),
      checkDateAfterSubmission(i),
      checkPossibleDuplicate(i, interactions),
      checkEmailMultipleNames(i, namesByEmail),
    ].filter((flag): flag is UncertainDataFlag => flag !== null);
    result.set(i.id, flags);
  }
  return result;
}
