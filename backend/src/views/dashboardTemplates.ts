import {
  InteractionDetail,
  InteractionHistory,
  InteractionSummary,
} from '../services/recruiterInteractions/recruiterInteractionsService';
import {
  CorrectionRequestHistoryItem,
  OpenCorrectionRequestItem,
} from '../services/correctionRequest/correctionRequestService';
import { CORRECTABLE_FIELDS, CorrectableField } from '../models/CorrectionRequest';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} - VendorIQ</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 720px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
  a { color: #0b5fff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .error { background: #fdeaea; border: 1px solid #e0a0a0; padding: 1rem; border-radius: 4px; }
  .empty { color: #666; padding: 1rem 0; }
  dl { display: grid; grid-template-columns: 10rem 1fr; row-gap: 0.5rem; }
  dt { font-weight: 600; color: #444; }
  .back { display: inline-block; margin-bottom: 1rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .pending { background: #fff8e6; border: 1px solid #e8cf8a; padding: 0.75rem 1rem; border-radius: 4px; margin-top: 2rem; }
  .pending h2 { margin-top: 0; }
  .pending-note { color: #6b5200; margin: 0.25rem 0 0; }
  .review-link { display: inline-block; margin-top: 1rem; }
  form.review-form { margin-top: 1rem; display: grid; gap: 0.75rem; max-width: 28rem; }
  form.review-form label { display: grid; gap: 0.25rem; font-weight: 600; color: #444; }
  form.review-form input { padding: 0.4rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
  form.review-form button { justify-self: start; padding: 0.5rem 1.25rem; background: #0b5fff; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  .red-flag-badge { display: inline-block; margin-left: 0.5rem; padding: 0.05rem 0.5rem; font-size: 0.8rem; color: #8a1c1c; background: #fdeaea; border: 1px solid #e0a0a0; border-radius: 999px; }
  .red-flags { background: #fdeaea; border: 1px solid #e0a0a0; padding: 0.75rem 1rem; border-radius: 4px; margin-top: 2rem; }
  .red-flags h2 { margin-top: 0; }
  .red-flags-note { color: #6b1a1a; margin: 0.25rem 0 0.5rem; }
  .uncertain-data { background: #fff8e6; border: 1px solid #e8cf8a; padding: 0.75rem 1rem; border-radius: 4px; margin-top: 2rem; }
  .uncertain-data h2 { margin-top: 0; }
  .uncertain-data-note { color: #6b5200; margin: 0.25rem 0 0.5rem; }
  .check-unavailable { background: #fff8e6; border: 1px solid #e8cf8a; color: #6b5200; padding: 0.75rem 1rem; border-radius: 4px; margin: 1rem 0; }
  form.review-form select, form.review-form textarea { padding: 0.4rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; }
  .corrected { color: #3d5a00; font-size: 0.9rem; }
  .corrections { border: 1px solid #ccd; padding: 0.75rem 1rem; border-radius: 4px; margin-top: 2rem; }
  .corrections h2 { margin-top: 0; }
  .corrections article { border-top: 1px solid #eee; padding: 0.75rem 0; }
  .corrections article:first-of-type { border-top: none; }
  .corrections .meta { color: #555; font-size: 0.9rem; margin: 0.25rem 0; }
  .corrections .answer { background: #f4f7ff; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0.5rem 0; }
  form.inline-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin-top: 0.5rem; }
  form.inline-form label { display: grid; gap: 0.15rem; font-size: 0.85rem; color: #444; }
  form.inline-form input { padding: 0.3rem; border: 1px solid #ccc; border-radius: 4px; }
  form.inline-form button { padding: 0.35rem 0.9rem; border: 1px solid #0b5fff; background: #fff; color: #0b5fff; border-radius: 4px; cursor: pointer; }
  .requests-link { background: #f4f7ff; border: 1px solid #c9d6ff; padding: 0.5rem 1rem; border-radius: 4px; }
  .notice { background: #eef8ee; border: 1px solid #a8d5a8; padding: 0.75rem 1rem; border-radius: 4px; }
  .request-card { border: 1px solid #ddd; border-radius: 4px; padding: 0.75rem 1rem; margin-top: 1rem; }
  .request-card .meta { color: #555; font-size: 0.9rem; margin: 0.25rem 0; }
  fieldset { border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem 1rem; }
  fieldset label { font-weight: normal !important; display: flex !important; gap: 0.5rem; align-items: baseline; }
  .attest { display: flex !important; gap: 0.5rem; align-items: baseline; font-weight: normal !important; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// Plain-language labels for why an interaction is, or is not, confirmed history (REQ-019).
const STATUS_LABELS: Record<InteractionSummary['historyStatusReason'], string> = {
  attested: 'Confirmed',
  reviewer_confirmed: 'Confirmed by a reviewer',
  awaiting_job_seeker: 'Waiting for the job seeker: correction requested',
  disputed: 'Waiting for review: disputed',
  correction_answered: 'Waiting for review: correction answered',
  unattested: 'Waiting for review: not attested as factual',
  uncertain: 'Waiting for review: uncertain data',
  uncertainty_unchecked: 'Waiting: not yet checked for uncertain data',
  reviewer_rejected: 'Rejected by a reviewer',
};

const PENDING_REASON_LABELS: Partial<Record<InteractionSummary['historyStatusReason'], string>> = {
  awaiting_job_seeker: 'Correction requested',
  disputed: 'Disputed',
  correction_answered: 'Correction answered',
  unattested: 'Not attested',
  uncertain: 'Uncertain data',
  uncertainty_unchecked: 'Not yet checked',
};

// STORY-004: red flags are observations for a person to check, never a verdict (REQ-015).
// A null list means the check could not run -- say so, rather than letting the page look clean.
const RED_FLAG_CHECK_UNAVAILABLE =
  '<p class="check-unavailable">Red flag check is unavailable right now, so these interactions have not been checked. Try again shortly.</p>';

function redFlagBadge(i: InteractionSummary): string {
  if (!i.redFlags || i.redFlags.length === 0) {
    return '';
  }
  const count = i.redFlags.length === 1 ? '1 red flag' : `${i.redFlags.length} red flags`;
  return ` <span class="red-flag-badge">&#9873; ${count} · for review</span>`;
}

function redFlagPanel(interaction: InteractionDetail): string {
  if (interaction.redFlags === null) {
    return RED_FLAG_CHECK_UNAVAILABLE;
  }
  if (interaction.redFlags.length === 0) {
    return '';
  }
  const items = interaction.redFlags
    .map((flag) => `<li><strong>${escapeHtml(flag.description)}</strong> — ${escapeHtml(flag.evidence)}</li>`)
    .join('\n');
  return `<section class="red-flags">
      <h2>Red flags — for your review</h2>
      <p class="red-flags-note">These are observations from the data, not a judgment of the recruiter. Check them before acting.</p>
      <ul>${items}</ul>
    </section>`;
}

// STORY-005: uncertain data is a fact about the data, not a judgment (REQ-005). If the check
// could not run, say so -- and that unchecked data is held, not shown as confirmed.
const UNCERTAINTY_CHECK_UNAVAILABLE =
  '<p class="check-unavailable">Uncertain-data check is unavailable right now. Interactions that have not been checked are held for review, not shown as confirmed. Try again shortly.</p>';

function uncertainDataPanel(interaction: InteractionDetail): string {
  if (interaction.uncertainFlags === null) {
    return UNCERTAINTY_CHECK_UNAVAILABLE;
  }
  if (interaction.uncertainFlags.length === 0) {
    return '';
  }
  const items = interaction.uncertainFlags
    .map((flag) => `<li><strong>${escapeHtml(flag.description)}</strong> — ${escapeHtml(flag.evidence)}</li>`)
    .join('\n');
  return `<section class="uncertain-data">
      <h2>Uncertain data — waiting for a data reviewer</h2>
      <p class="uncertain-data-note">These are facts about the data, not a judgment. A data reviewer will check them before this counts as confirmed history.</p>
      <ul>${items}</ul>
    </section>`;
}

export function renderDashboardPage(
  history: InteractionHistory,
  options: { openRequestCount?: number; requestsUnavailable?: boolean } = {}
): string {
  const { confirmed, pendingReview } = history;
  // STORY-011: requests waiting on the job seeker, one click from the dashboard (REQ-008). If
  // they could not be checked, say so rather than implying there are none.
  let requestsLink = '';
  if (options.requestsUnavailable) {
    requestsLink =
      '<p class="check-unavailable">We could not check for requests waiting for you right now. <a href="/dashboard/requests">Try the requests page</a> or come back shortly.</p>';
  } else if (options.openRequestCount && options.openRequestCount > 0) {
    requestsLink = `<p class="requests-link"><a href="/dashboard/requests">Requests for you (${options.openRequestCount}) &rarr;</a></p>`;
  }
  const all = [...confirmed, ...pendingReview];
  const checkUnavailable =
    (all.some((i) => i.redFlags === null) ? RED_FLAG_CHECK_UNAVAILABLE : '') +
    (all.some((i) => i.uncertainFlags === null) ? UNCERTAINTY_CHECK_UNAVAILABLE : '');

  const confirmedRows = confirmed
    .map(
      (i) => `<tr>
        <td><a href="/dashboard/interactions/${i.id}">${escapeHtml(i.recruiterName)}</a>${redFlagBadge(i)}</td>
        <td>${escapeHtml(i.recruiterCompany ?? '—')}</td>
        <td>${escapeHtml(i.interactionType)}</td>
        <td>${formatDate(i.interactionDate)}</td>
      </tr>`
    )
    .join('\n');

  let confirmedBody: string;
  if (confirmed.length > 0) {
    confirmedBody = `<table>
        <thead><tr><th>Recruiter</th><th>Company</th><th>Type</th><th>Date</th></tr></thead>
        <tbody>${confirmedRows}</tbody>
      </table>`;
  } else if (pendingReview.length > 0) {
    confirmedBody = '<p class="empty">No confirmed recruiter interactions yet.</p>';
  } else {
    confirmedBody = '<p class="empty">No recruiter interactions have been ingested yet.</p>';
  }

  // Kept in its own, clearly labelled section: these are never shown as confirmed history.
  const pendingRows = pendingReview
    .map(
      (i) => `<tr>
        <td><a href="/dashboard/interactions/${i.id}">${escapeHtml(i.recruiterName)}</a>${redFlagBadge(i)}</td>
        <td>${escapeHtml(i.recruiterCompany ?? '—')}</td>
        <td>${formatDate(i.interactionDate)}</td>
        <td>${escapeHtml(PENDING_REASON_LABELS[i.historyStatusReason] ?? i.historyStatusReason)}</td>
      </tr>`
    )
    .join('\n');

  const pendingSection =
    pendingReview.length === 0
      ? ''
      : `<section class="pending">
        <h2>Waiting for review — not confirmed recruiter history</h2>
        <p class="pending-note">These interactions were not attested as factual, have been disputed, or were flagged as uncertain data. A data reviewer must check them before they count as confirmed.</p>
        <table>
          <thead><tr><th>Recruiter</th><th>Company</th><th>Date</th><th>Why</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </section>`;

  return layout(
    'Dashboard',
    `<h1>Your Recruiter Interactions</h1>${requestsLink}${checkUnavailable}${confirmedBody}${pendingSection}`
  );
}

// STORY-011: plain-language names for the fields a job seeker can be asked to correct.
const FIELD_LABELS: Record<CorrectableField, string> = {
  recruiterName: 'Recruiter name',
  recruiterEmail: 'Email',
  recruiterCompany: 'Company',
  interactionDate: 'Date',
  interactionType: 'Type',
  channel: 'Channel',
  notes: 'Notes',
};

const REQUEST_STATUS_LABELS: Record<CorrectionRequestHistoryItem['status'], string> = {
  open: 'Waiting for the job seeker',
  answered: 'Answered — waiting for a reviewer',
  closed: 'Closed',
};

const ANSWER_LABELS: Record<NonNullable<CorrectionRequestHistoryItem['response']>['answer'], string> = {
  corrected: 'Corrected',
  confirmed_as_is: 'Confirmed as correct',
  unavailable: 'Information unavailable',
};

function displayValue(field: string, value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return field === 'interactionDate' ? formatDate(new Date(value)) : String(value);
}

function fieldLabel(field: string): string {
  return (FIELD_LABELS as Record<string, string>)[field] ?? field;
}

// A field's current value, marked when a job seeker's attested correction changed it.
function detailValue(interaction: InteractionDetail, field: CorrectableField): string {
  const current = escapeHtml(displayValue(field, interaction[field]));
  if (!interaction.correctedFields.includes(field)) {
    return current;
  }
  const original = escapeHtml(displayValue(field, interaction.originalValues[field]));
  return `${current} <span class="corrected">(corrected by the job seeker; originally ${original})</span>`;
}

function correctionAnswer(response: NonNullable<CorrectionRequestHistoryItem['response']>): string {
  const values = response.correctedValues
    ? Object.entries(response.correctedValues)
        .map(([field, value]) => `${escapeHtml(fieldLabel(field))}: ${escapeHtml(displayValue(field, value))}`)
        .join('; ')
    : '';
  return `<div class="answer">
      <strong>${ANSWER_LABELS[response.answer]}</strong>${values ? ` — ${values}` : ''}
      <p class="meta">Reason: ${escapeHtml(response.reason)}</p>
      <p class="meta">Attested by ${escapeHtml(response.respondedBy)} on ${formatDate(response.respondedAt)}: “${escapeHtml(response.statement)}”</p>
    </div>`;
}

function correctionClosing(r: CorrectionRequestHistoryItem): string {
  if (r.status !== 'closed' || r.closedAt === null) {
    return '';
  }
  const by = escapeHtml(r.closedBy ?? '');
  return r.closedByDecisionId !== null
    ? `<p class="meta">Closed by ${by}’s ruling on ${formatDate(r.closedAt)}.</p>`
    : `<p class="meta">Withdrawn by ${by} on ${formatDate(r.closedAt)}: ${escapeHtml(r.closeReason ?? '')}</p>`;
}

function withdrawForm(requestId: number): string {
  return `<form class="inline-form" method="post" action="/dashboard/correction-requests/${requestId}/withdraw">
      <label>Reviewer ID <input type="text" name="reviewerId" required></label>
      <label>Reason for withdrawing <input type="text" name="reason" required></label>
      <button type="submit">Withdraw request</button>
    </form>`;
}

// STORY-011: the interaction's correction requests -- its correction audit trail -- newest first.
function correctionRequestsPanel(interactionId: number, requests: CorrectionRequestHistoryItem[], error?: string): string {
  const errorBlock = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const items = requests
    .map((r) => {
      const asked = r.fields.map(fieldLabel).join(' or ') || 'the interaction';
      const raiser = r.raisedByType === 'system' ? 'the system (uncertain-data rule)' : escapeHtml(r.raisedBy);
      return `<article>
        <strong>${REQUEST_STATUS_LABELS[r.status]}</strong> — asked for: ${escapeHtml(asked)}
        <p class="meta">Requested by ${raiser} on ${formatDate(r.raisedAt)}: ${escapeHtml(r.reason)}</p>
        ${r.response ? correctionAnswer(r.response) : ''}
        ${correctionClosing(r)}
        ${r.status === 'open' ? withdrawForm(r.requestId) : ''}
      </article>`;
    })
    .join('\n');
  const body = requests.length === 0 ? '<p class="empty">No corrections have been requested for this interaction.</p>' : items;
  return `<section class="corrections">
      <h2>Correction requests</h2>
      ${errorBlock}
      ${body}
      <a class="review-link" href="/dashboard/interactions/${interactionId}/request-correction">Request a correction from the job seeker &rarr;</a>
    </section>`;
}

export interface DecisionFormValues {
  reviewerId?: string;
  decision?: string;
  note?: string;
}

// STORY-011 / REQ-019: a data reviewer's ruling, when the interaction is waiting for one. It is
// paused while the reviewer's own request waits on the job seeker, or while the uncertain-data
// check cannot run -- the same rules decideHistoryReview enforces.
function decisionPanel(interaction: InteractionDetail, error?: string, values: DecisionFormValues = {}): string {
  const errorBlock = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  if (interaction.historyStatus !== 'pending_review') {
    // No ruling is needed -- but a refused one (say, from a stale page) must still say why.
    return error ? `<section class="pending"><h2>Reviewer decision</h2>${errorBlock}</section>` : '';
  }
  let body: string;
  if (interaction.historyStatusReason === 'awaiting_job_seeker') {
    body = '<p class="pending-note">Ruling paused: waiting for the job seeker’s answer. Withdraw the request to rule now.</p>';
  } else if (interaction.uncertainFlags === null) {
    body = '<p class="pending-note">Ruling paused: the uncertain-data check is unavailable right now. Try again shortly.</p>';
  } else {
    const choice = (value: string, label: string) =>
      `<label><input type="radio" name="decision" value="${value}"${values.decision === value ? ' checked' : ''} required> ${label}</label>`;
    body = `<form class="review-form" method="post" action="/dashboard/interactions/${interaction.id}/decision">
        <label>Your reviewer ID
          <input type="text" name="reviewerId" value="${escapeHtml(values.reviewerId ?? '')}" required>
        </label>
        <fieldset>
          <legend>Your ruling</legend>
          ${choice('confirmed', 'Confirm — show it as confirmed recruiter history')}
          ${choice('rejected', 'Reject — keep it out of recruiter history')}
        </fieldset>
        <label>Note (optional)
          <textarea name="note" rows="2">${escapeHtml(values.note ?? '')}</textarea>
        </label>
        <button type="submit">Record ruling</button>
      </form>`;
  }
  return `<section class="pending">
      <h2>Reviewer decision</h2>
      ${errorBlock}
      ${body}
    </section>`;
}

export function renderDetailPage(
  interaction: InteractionDetail,
  options: {
    requests?: CorrectionRequestHistoryItem[];
    error?: string;
    decisionError?: string;
    decisionValues?: DecisionFormValues;
  } = {}
): string {
  return layout(
    `${interaction.recruiterName} - Interaction Detail`,
    `<a class="back" href="/dashboard">&larr; Back to dashboard</a>
    <h1>${escapeHtml(interaction.recruiterName)}</h1>
    ${
      interaction.correctedFields.includes('recruiterName')
        ? `<p class="corrected">Name corrected by the job seeker; originally ${escapeHtml(displayValue('recruiterName', interaction.originalValues.recruiterName))}</p>`
        : ''
    }
    <dl>
      <dt>Company</dt><dd>${detailValue(interaction, 'recruiterCompany')}</dd>
      <dt>Email</dt><dd>${detailValue(interaction, 'recruiterEmail')}</dd>
      <dt>Type</dt><dd>${detailValue(interaction, 'interactionType')}</dd>
      <dt>Channel</dt><dd>${detailValue(interaction, 'channel')}</dd>
      <dt>Date</dt><dd>${detailValue(interaction, 'interactionDate')}</dd>
      <dt>Notes</dt><dd>${detailValue(interaction, 'notes')}</dd>
      <dt>History status</dt><dd>${escapeHtml(STATUS_LABELS[interaction.historyStatusReason])}</dd>
    </dl>
    ${uncertainDataPanel(interaction)}
    ${redFlagPanel(interaction)}
    ${correctionRequestsPanel(interaction.id, options.requests ?? [], options.error)}
    ${decisionPanel(interaction, options.decisionError, options.decisionValues)}
    <a class="review-link" href="/dashboard/interactions/${interaction.id}/review">Review / correct attribution &rarr;</a>`
  );
}

export interface RequestCorrectionFormValues {
  reviewerId?: string;
  field?: string;
  reason?: string;
}

// STORY-011: a data reviewer asks the job seeker to correct or complete one field.
export function renderRequestCorrectionForm(
  interaction: InteractionDetail,
  options?: { error?: string; values?: RequestCorrectionFormValues }
): string {
  const values = options?.values ?? {};
  const errorBlock = options?.error ? `<div class="error">${escapeHtml(options.error)}</div>` : '';
  const fieldOptions = CORRECTABLE_FIELDS.map(
    (f) =>
      `<option value="${f}"${values.field === f ? ' selected' : ''}>${FIELD_LABELS[f]} (now: ${escapeHtml(displayValue(f, interaction[f]))})</option>`
  ).join('');
  return layout(
    `Request a correction - ${interaction.recruiterName}`,
    `<a class="back" href="/dashboard/interactions/${interaction.id}">&larr; Back to interaction</a>
    <h1>Request a correction from the job seeker</h1>
    <p>Reviewers do not change submitted data. Say what looks incomplete or wrong, and the job seeker who submitted it will be asked to correct it, confirm it, or say it is unavailable.</p>
    ${errorBlock}
    <form class="review-form" method="post" action="/dashboard/interactions/${interaction.id}/request-correction">
      <label>Your reviewer ID
        <input type="text" name="reviewerId" value="${escapeHtml(values.reviewerId ?? '')}" required>
      </label>
      <label>Which field
        <select name="field" required><option value="">Choose a field</option>${fieldOptions}</select>
      </label>
      <label>What is incomplete or wrong, and why
        <textarea name="reason" rows="3" required>${escapeHtml(values.reason ?? '')}</textarea>
      </label>
      <button type="submit">Send request</button>
    </form>`
  );
}

export interface ReviewFormValues {
  reviewerId?: string;
  recruiterName?: string;
  recruiterCompany?: string;
}

export function renderReviewForm(interaction: InteractionDetail, options?: { error?: string; values?: ReviewFormValues }): string {
  const reviewerId = options?.values?.reviewerId ?? '';
  const recruiterName = options?.values?.recruiterName ?? interaction.recruiterName;
  const recruiterCompany = options?.values?.recruiterCompany ?? interaction.recruiterCompany ?? '';

  const errorBlock = options?.error ? `<div class="error">${escapeHtml(options.error)}</div>` : '';

  return layout(
    `Review attribution - ${interaction.recruiterName}`,
    `<a class="back" href="/dashboard/interactions/${interaction.id}">&larr; Back to interaction</a>
    <h1>Review attribution</h1>
    <p>Confirm this interaction is attributed to the correct recruiter, or correct it below.</p>
    ${errorBlock}
    <form class="review-form" method="post" action="/dashboard/interactions/${interaction.id}/review">
      <label>Your reviewer ID
        <input type="text" name="reviewerId" value="${escapeHtml(reviewerId)}" required>
      </label>
      <label>Recruiter name
        <input type="text" name="recruiterName" value="${escapeHtml(recruiterName)}" required>
      </label>
      <label>Recruiter company
        <input type="text" name="recruiterCompany" value="${escapeHtml(recruiterCompany)}">
      </label>
      <button type="submit">Save review</button>
    </form>`
  );
}

function requestSummary(item: OpenCorrectionRequestItem): string {
  const asked = item.fields.map(fieldLabel).join(' or ') || 'the interaction';
  const raiser = item.raisedByType === 'system' ? 'VendorIQ (an automatic data check)' : `data reviewer ${escapeHtml(item.raisedBy)}`;
  const forWhom =
    item.forJobSeekers.length > 0 ? escapeHtml(item.forJobSeekers.join(', ')) : 'the job seeker who submitted it';
  return `<strong>${escapeHtml(item.interaction.recruiterName)}</strong> — ${escapeHtml(item.interaction.recruiterCompany ?? '—')}, ${escapeHtml(item.interaction.interactionType)} on ${formatDate(item.interaction.interactionDate)}
      <p class="meta">Asked for: ${escapeHtml(asked)}</p>
      <p class="meta">Why: ${escapeHtml(item.reason)}</p>
      <p class="meta">Asked by ${raiser} on ${formatDate(item.raisedAt)} · For: ${forWhom}</p>`;
}

// STORY-011: the job seeker's list of correction requests waiting for their answer.
export function renderRequestsPage(items: OpenCorrectionRequestItem[], options: { answered?: boolean } = {}): string {
  const notice = options.answered ? '<p class="notice">Thank you — your answer has been sent to a reviewer.</p>' : '';
  const body =
    items.length === 0
      ? '<p class="empty">No requests are waiting for an answer.</p>'
      : items
          .map(
            (item) => `<div class="request-card">
        ${requestSummary(item)}
        <a class="review-link" href="/dashboard/requests/${item.requestId}">Answer this request &rarr;</a>
      </div>`
          )
          .join('\n');
  return layout(
    'Requests for you',
    `<a class="back" href="/dashboard">&larr; Back to dashboard</a>
    <h1>Requests for you</h1>
    <p>A data reviewer, or an automatic data check, has asked about interactions you submitted. You can correct the data, confirm it is right as entered, or say the information is unavailable. Your original submission is always kept.</p>
    ${notice}${body}`
  );
}

export interface AnswerFormValues {
  respondedBy?: string;
  answer?: string;
  reason?: string;
  fieldValues?: Partial<Record<CorrectableField, string>>;
  attested?: boolean;
}

// The value as a form input shows it: dates as YYYY-MM-DD, missing values as empty.
export function inputValue(field: CorrectableField, value: string | Date | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return field === 'interactionDate' ? new Date(value).toISOString().slice(0, 10) : String(value);
}

// STORY-011: the job seeker's attested answer to one request.
export function renderAnswerForm(
  item: OpenCorrectionRequestItem,
  statement: string,
  options?: { error?: string; values?: AnswerFormValues }
): string {
  const values = options?.values ?? {};
  const errorBlock = options?.error ? `<div class="error">${escapeHtml(options.error)}</div>` : '';
  const choice = (value: string, label: string) =>
    `<label><input type="radio" name="answer" value="${value}"${values.answer === value ? ' checked' : ''} required> ${label}</label>`;
  const fieldInputs = item.fields
    .map((field) => {
      const shown = values.fieldValues?.[field] ?? inputValue(field, item.currentValues[field]);
      const type = field === 'interactionDate' ? 'date' : field === 'recruiterEmail' ? 'email' : 'text';
      return `<label>${fieldLabel(field)} (now: ${escapeHtml(displayValue(field, item.currentValues[field]))})
        <input type="${type}" name="value_${field}" value="${escapeHtml(shown)}">
      </label>`;
    })
    .join('\n');
  return layout(
    'Answer a request',
    `<a class="back" href="/dashboard/requests">&larr; Back to requests</a>
    <h1>Answer a request</h1>
    <div class="request-card">${requestSummary(item)}</div>
    ${errorBlock}
    <form class="review-form" method="post" action="/dashboard/requests/${item.requestId}">
      <label>Your job seeker ID
        <input type="text" name="respondedBy" value="${escapeHtml(values.respondedBy ?? '')}" required>
      </label>
      <fieldset>
        <legend>Your answer</legend>
        ${choice('corrected', 'Correct it — enter the right value below')}
        ${choice('confirmed_as_is', 'It is right as entered')}
        ${choice('unavailable', 'I don’t have this information')}
      </fieldset>
      ${fieldInputs}
      <label>Your reason
        <textarea name="reason" rows="3" required>${escapeHtml(values.reason ?? '')}</textarea>
      </label>
      <label class="attest"><input type="checkbox" name="attest" value="yes"${values.attested ? ' checked' : ''} required> ${escapeHtml(statement)}</label>
      <button type="submit">Send answer</button>
    </form>`
  );
}

export function renderErrorPage(title: string, message: string): string {
  return layout(
    title,
    `<a class="back" href="/dashboard">&larr; Back to dashboard</a>
    <h1>${escapeHtml(title)}</h1>
    <div class="error">${escapeHtml(message)}</div>`
  );
}
