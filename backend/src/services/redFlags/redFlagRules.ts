/**
 * STORY-004 / REQ-003: fixed, factual red-flag rules for recruiter interactions.
 *
 * Every rule reports something observable in the data -- a phrase in the notes, an email
 * domain, a mismatch between records -- and quotes the evidence. None of them scores or
 * judges the recruiter (REQ-015): a flag means "a person should look at this", nothing more.
 */

// Bump when a rule's logic or wording changes, so the audit log shows which rules raised a flag.
export const RED_FLAG_RULES_VERSION = 1;

export type RedFlagRuleId =
  | 'money_or_personal_data' // R1
  | 'personal_email_domain' // R2
  | 'email_multiple_companies' // R3
  | 'offer_without_interview'; // R4

export interface RedFlag {
  ruleId: RedFlagRuleId;
  description: string; // what was observed, in plain language
  evidence: string; // the exact text or fields that triggered it
}

export interface RedFlagInteraction {
  id: number;
  recruiterName: string;
  recruiterEmail: string | null;
  recruiterCompany: string | null;
  interactionDate: Date;
  interactionType: string;
  notes: string | null;
}

// R1. Whole-word matches only, so "feedback" and "coffee" never match "fee". Negation is not
// understood ("there is no fee" still matches) -- acceptable, because a person reviews every flag.
const MONEY_OR_PERSONAL_DATA_PHRASES = [
  'fee', 'fees', 'upfront', 'up-front', 'deposit', 'pay for training', 'gift card', 'gift cards',
  'wire transfer', 'ssn', 'social security number', 'bank details', 'bank account',
];
const PHRASE_PATTERN = new RegExp(
  `\\b(?:${MONEY_OR_PERSONAL_DATA_PHRASES.map((p) => p.replace(/[-]/g, '\\-').replace(/ /g, '\\s+')).join('|')})\\b`,
  'gi'
);

// R2.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'aol.com', 'proton.me', 'protonmail.com',
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// UTC calendar day, e.g. "2026-09-10". R4 compares days, not times: an interview later on the
// same day as an offer still counts as "on or before" it, matching the evidence wording.
function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function checkMoneyOrPersonalData(i: RedFlagInteraction): RedFlag | null {
  if (!i.notes) return null;
  // Collapse inner whitespace too, so "pay  for training" and "pay for training" are one entry.
  const phrases = [...new Set((i.notes.match(PHRASE_PATTERN) ?? []).map((p) => normalize(p).replace(/\s+/g, ' ')))];
  if (phrases.length === 0) return null;
  return {
    ruleId: 'money_or_personal_data',
    description: 'Notes mention a payment or personal/financial details',
    evidence: phrases.map((p) => `"${p}"`).join(', '),
  };
}

function checkPersonalEmailDomain(i: RedFlagInteraction): RedFlag | null {
  if (!i.recruiterEmail || !i.recruiterCompany?.trim()) return null;
  const domain = normalize(i.recruiterEmail.split('@')[1] ?? '');
  if (!PERSONAL_EMAIL_DOMAINS.has(domain)) return null;
  return {
    ruleId: 'personal_email_domain',
    description: 'Personal email domain used while representing a company',
    evidence: `${domain}, representing ${i.recruiterCompany.trim()}`,
  };
}

interface CompanySpelling {
  id: number; // the interaction it came from, so the earliest spelling can win
  display: string;
}

function checkEmailMultipleCompanies(
  i: RedFlagInteraction,
  companiesByEmail: Map<string, Map<string, CompanySpelling>>
): RedFlag | null {
  if (!i.recruiterEmail || !i.recruiterCompany?.trim()) return null;
  const others = [...(companiesByEmail.get(normalize(i.recruiterEmail)) ?? new Map<string, CompanySpelling>()).entries()]
    .filter(([key]) => key !== normalize(i.recruiterCompany!))
    .map(([, spelling]) => spelling.display)
    // Sorted so the evidence text -- and its audit hash -- never depends on row order.
    .sort((a, b) => a.localeCompare(b));
  if (others.length === 0) return null;
  return {
    ruleId: 'email_multiple_companies',
    description: 'The same email appears under different company names',
    evidence: `${normalize(i.recruiterEmail)} also recorded under: ${others.join(', ')}`,
  };
}

// "Same recruiter" is matched leniently -- same email, or same name -- so an interview logged
// with slightly different details still counts, and we err away from flagging.
function checkOfferWithoutInterview(i: RedFlagInteraction, all: RedFlagInteraction[]): RedFlag | null {
  if (i.interactionType !== 'offer') return null;
  const sameRecruiter = (o: RedFlagInteraction) =>
    (i.recruiterEmail !== null && o.recruiterEmail !== null && normalize(o.recruiterEmail) === normalize(i.recruiterEmail)) ||
    normalize(o.recruiterName) === normalize(i.recruiterName);
  const offerDay = calendarDay(i.interactionDate);
  const hasEarlierInterview = all.some(
    (o) => o.id !== i.id && o.interactionType === 'interview' && sameRecruiter(o) && calendarDay(o.interactionDate) <= offerDay
  );
  if (hasEarlierInterview) return null;
  return {
    ruleId: 'offer_without_interview',
    description: 'Offer recorded with no earlier interview on record',
    evidence: `No interview with ${i.recruiterName} on or before ${offerDay}`,
  };
}

/**
 * Runs every rule over a set of interactions. R3 and R4 compare records with each other, so
 * pass the whole set a job seeker can see (reviewer-rejected interactions left out by the caller).
 * Every id gets an entry; an empty array means "checked, no red flags".
 */
export function detectRedFlags(interactions: RedFlagInteraction[]): Map<number, RedFlag[]> {
  const companiesByEmail = new Map<string, Map<string, CompanySpelling>>(); // email -> (normalized company -> spelling)
  for (const i of interactions) {
    if (!i.recruiterEmail || !i.recruiterCompany?.trim()) continue;
    const email = normalize(i.recruiterEmail);
    if (!companiesByEmail.has(email)) companiesByEmail.set(email, new Map());
    const companies = companiesByEmail.get(email)!;
    const key = normalize(i.recruiterCompany);
    // Keep the lowest-id spelling ("Beta LLC" vs "beta llc"), so the shown name -- and the
    // audit hash -- stays the same whatever order the records arrive in.
    const existing = companies.get(key);
    if (existing === undefined || i.id < existing.id) {
      companies.set(key, { id: i.id, display: i.recruiterCompany.trim() });
    }
  }

  const result = new Map<number, RedFlag[]>();
  for (const i of interactions) {
    const flags = [
      checkMoneyOrPersonalData(i),
      checkPersonalEmailDomain(i),
      checkEmailMultipleCompanies(i, companiesByEmail),
      checkOfferWithoutInterview(i, interactions),
    ].filter((flag): flag is RedFlag => flag !== null);
    result.set(i.id, flags);
  }
  return result;
}
