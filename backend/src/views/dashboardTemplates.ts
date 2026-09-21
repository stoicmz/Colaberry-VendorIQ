import { InteractionDetail, InteractionSummary } from '../services/recruiterInteractions/recruiterInteractionsService';

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
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function renderDashboardPage(interactions: InteractionSummary[]): string {
  const rows = interactions
    .map(
      (i) => `<tr>
        <td><a href="/dashboard/interactions/${i.id}">${escapeHtml(i.recruiterName)}</a></td>
        <td>${escapeHtml(i.recruiterCompany ?? '—')}</td>
        <td>${escapeHtml(i.interactionType)}</td>
        <td>${formatDate(i.interactionDate)}</td>
      </tr>`
    )
    .join('\n');

  const body =
    interactions.length === 0
      ? '<p class="empty">No recruiter interactions have been ingested yet.</p>'
      : `<table>
        <thead><tr><th>Recruiter</th><th>Company</th><th>Type</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

  return layout(
    'Dashboard',
    `<h1>Your Recruiter Interactions</h1>${body}`
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
    </dl>`
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
