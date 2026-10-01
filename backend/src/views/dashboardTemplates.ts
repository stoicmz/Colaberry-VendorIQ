import {
  InteractionDetail,
  InteractionHistory,
  InteractionSummary,
} from '../services/recruiterInteractions/recruiterInteractionsService';

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
  .check-unavailable { background: #fff8e6; border: 1px solid #e8cf8a; color: #6b5200; padding: 0.75rem 1rem; border-radius: 4px; margin: 1rem 0; }
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
  disputed: 'Waiting for review: disputed',
  unattested: 'Waiting for review: not attested as factual',
  reviewer_rejected: 'Rejected by a reviewer',
};

const PENDING_REASON_LABELS: Partial<Record<InteractionSummary['historyStatusReason'], string>> = {
  disputed: 'Disputed',
  unattested: 'Not attested',
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

export function renderDashboardPage(history: InteractionHistory): string {
  const { confirmed, pendingReview } = history;
  const checkUnavailable = [...confirmed, ...pendingReview].some((i) => i.redFlags === null)
    ? RED_FLAG_CHECK_UNAVAILABLE
    : '';

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
        <p class="pending-note">These interactions were not attested as factual, or have been disputed. A data reviewer must check them before they count as confirmed.</p>
        <table>
          <thead><tr><th>Recruiter</th><th>Company</th><th>Date</th><th>Why</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </section>`;

  return layout(
    'Dashboard',
    `<h1>Your Recruiter Interactions</h1>${checkUnavailable}${confirmedBody}${pendingSection}`
  );
}

export function renderDetailPage(interaction: InteractionDetail): string {
  return layout(
    `${interaction.recruiterName} - Interaction Detail`,
    `<a class="back" href="/dashboard">&larr; Back to dashboard</a>
    <h1>${escapeHtml(interaction.recruiterName)}</h1>
    <dl>
      <dt>Company</dt><dd>${escapeHtml(interaction.recruiterCompany ?? '—')}</dd>
      <dt>Email</dt><dd>${escapeHtml(interaction.recruiterEmail ?? '—')}</dd>
      <dt>Type</dt><dd>${escapeHtml(interaction.interactionType)}</dd>
      <dt>Channel</dt><dd>${escapeHtml(interaction.channel ?? '—')}</dd>
      <dt>Date</dt><dd>${formatDate(interaction.interactionDate)}</dd>
      <dt>Notes</dt><dd>${escapeHtml(interaction.notes ?? '—')}</dd>
      <dt>History status</dt><dd>${escapeHtml(STATUS_LABELS[interaction.historyStatusReason])}</dd>
    </dl>
    ${redFlagPanel(interaction)}
    <a class="review-link" href="/dashboard/interactions/${interaction.id}/review">Review / correct attribution &rarr;</a>`
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

export function renderErrorPage(title: string, message: string): string {
  return layout(
    title,
    `<a class="back" href="/dashboard">&larr; Back to dashboard</a>
    <h1>${escapeHtml(title)}</h1>
    <div class="error">${escapeHtml(message)}</div>`
  );
}
