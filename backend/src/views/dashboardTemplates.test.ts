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
    };

    expect(renderDashboardPage([interaction])).toContain('Aug 18, 2026');
    expect(renderDetailPage(interaction)).toContain('Aug 18, 2026');
  });
});
