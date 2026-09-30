import { renderDashboardPage, renderDetailPage } from './dashboardTemplates';

describe('date rendering', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('renders the calendar date as ingested, regardless of the server timezone', () => {
    // Regression test: interactionDate is stored as UTC midnight for a date-only
    // value with no meaningful time-of-day. Formatting it through the server's
    // local timezone (e.g. anything behind UTC) rolled it back to the previous day.
    process.env.TZ = 'America/Chicago';

    const interaction = {
      id: 1,
      recruiterName: 'Sarah Kim',
      recruiterCompany: 'Bright Path Staffing',
      interactionDate: new Date('2026-08-18T00:00:00.000Z'),
      interactionType: 'email',
      recruiterEmail: null,
      channel: null,
      notes: null,
      historyStatus: 'confirmed' as const,
      historyStatusReason: 'attested' as const,
    };

    expect(renderDashboardPage({ confirmed: [interaction], pendingReview: [] })).toContain('Aug 18, 2026');
    expect(renderDetailPage(interaction)).toContain('Aug 18, 2026');
  });
});

describe('confirmed history vs manual review (REQ-019)', () => {
  const base = {
    recruiterCompany: null,
    interactionDate: new Date('2026-08-18T00:00:00.000Z'),
    interactionType: 'email',
  };
  const confirmed = {
    ...base,
    id: 1,
    recruiterName: 'Confirmed Recruiter',
    historyStatus: 'confirmed' as const,
    historyStatusReason: 'attested' as const,
  };
  const disputed = {
    ...base,
    id: 2,
    recruiterName: 'Disputed Recruiter',
    historyStatus: 'pending_review' as const,
    historyStatusReason: 'disputed' as const,
  };

  it('shows pending interactions only in the labelled review section, after the confirmed table', () => {
    const html = renderDashboardPage({ confirmed: [confirmed], pendingReview: [disputed] });

    const reviewHeading = html.indexOf('Waiting for review — not confirmed recruiter history');
    expect(reviewHeading).toBeGreaterThan(-1);
    expect(html.indexOf('Confirmed Recruiter')).toBeLessThan(reviewHeading);
    expect(html.indexOf('Disputed Recruiter')).toBeGreaterThan(reviewHeading);
    expect(html).toContain('<td>Disputed</td>');
  });

  it('says there is no confirmed history yet, rather than "nothing ingested", when all rows are pending', () => {
    const html = renderDashboardPage({ confirmed: [], pendingReview: [disputed] });

    expect(html).toContain('No confirmed recruiter interactions yet.');
    expect(html).not.toContain('No recruiter interactions have been ingested yet.');
  });

  it('omits the review section when nothing is waiting for review', () => {
    expect(renderDashboardPage({ confirmed: [confirmed], pendingReview: [] })).not.toContain('Waiting for review');
  });

  it('shows the history status on the detail page', () => {
    const html = renderDetailPage({ ...disputed, recruiterEmail: null, channel: null, notes: null });

    expect(html).toContain('Waiting for review: disputed');
  });
});
