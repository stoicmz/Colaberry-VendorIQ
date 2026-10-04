import { CorrectableField } from '../models/CorrectionRequest';
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
      correctedFields: [] as CorrectableField[],
      originalValues: {},
      redFlags: [],
      uncertainFlags: [],
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
    correctedFields: [] as CorrectableField[],
    originalValues: {},
    redFlags: [],
    uncertainFlags: [],
  };
  const disputed = {
    ...base,
    id: 2,
    recruiterName: 'Disputed Recruiter',
    historyStatus: 'pending_review' as const,
    historyStatusReason: 'disputed' as const,
    correctedFields: [] as CorrectableField[],
    originalValues: {},
    redFlags: [],
    uncertainFlags: [],
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

describe('red flag highlighting (STORY-004)', () => {
  const feeFlag = {
    ruleId: 'money_or_personal_data' as const,
    description: 'Notes mention a payment or personal/financial details',
    evidence: '"upfront", "fee"',
  };
  const gmailFlag = {
    ruleId: 'personal_email_domain' as const,
    description: 'Personal email domain used while representing a company',
    evidence: 'gmail.com, representing Acme',
  };
  const summary = {
    id: 7,
    recruiterName: 'Flagged Recruiter',
    recruiterCompany: 'Acme',
    interactionDate: new Date('2026-08-18T00:00:00.000Z'),
    interactionType: 'email',
    historyStatus: 'confirmed' as const,
    historyStatusReason: 'attested' as const,
    correctedFields: [] as CorrectableField[],
    originalValues: {},
    redFlags: [feeFlag, gmailFlag],
    uncertainFlags: [],
  };
  const detail = { ...summary, recruiterEmail: 'jane@gmail.com', channel: null, notes: 'Asked for an upfront fee.' };

  // The CSS in <head> names these classes on every page, so assert on the elements themselves.
  const BADGE = '<span class="red-flag-badge">';
  const PANEL = '<section class="red-flags">';
  const UNAVAILABLE = '<p class="check-unavailable">';

  it('highlights a flagged interaction on the list with a count, in both sections', () => {
    const pending = { ...summary, id: 8, historyStatus: 'pending_review' as const, historyStatusReason: 'disputed' as const, redFlags: [feeFlag] };
    const html = renderDashboardPage({ confirmed: [summary], pendingReview: [pending] });

    expect(html).toContain(`${BADGE}&#9873; 2 red flags · for review</span>`);
    expect(html).toContain(`${BADGE}&#9873; 1 red flag · for review</span>`);
    expect(html).not.toContain(UNAVAILABLE);
  });

  it('shows no highlight at all when there are no red flags', () => {
    const clean = { ...summary, redFlags: [] };

    expect(renderDashboardPage({ confirmed: [clean], pendingReview: [] })).not.toContain(BADGE);
    expect(renderDetailPage({ ...detail, redFlags: [] })).not.toContain(PANEL);
  });

  it('lists each red flag with its evidence on the detail page, framed as for review', () => {
    const html = renderDetailPage(detail);

    expect(html).toContain(PANEL);
    expect(html).toContain('Red flags — for your review');
    expect(html).toContain('not a judgment of the recruiter');
    expect(html).toContain('<strong>Notes mention a payment or personal/financial details</strong> — &quot;upfront&quot;, &quot;fee&quot;');
    expect(html).toContain('<strong>Personal email domain used while representing a company</strong> — gmail.com, representing Acme');
  });

  it('says the check is unavailable, instead of looking clean, when red flags are null', () => {
    const unchecked = { ...summary, redFlags: null };

    const list = renderDashboardPage({ confirmed: [unchecked], pendingReview: [] });
    const page = renderDetailPage({ ...detail, redFlags: null });

    expect(list).toContain(UNAVAILABLE);
    expect(list).not.toContain(BADGE);
    expect(page).toContain(UNAVAILABLE);
    expect(page).not.toContain(PANEL);
  });

  it('escapes evidence, since it quotes user-entered notes', () => {
    const html = renderDetailPage({ ...detail, redFlags: [{ ...feeFlag, evidence: '<script>alert(1)</script> fee' }] });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; fee');
  });
});

describe('uncertain data (STORY-005)', () => {
  const unidentifiedFlag = {
    ruleId: 'unidentified_recruiter' as const,
    description: 'Recruiter cannot be identified: no email or company recorded',
    evidence: 'Only a name is recorded: Jane Doe',
  };
  const uncertain = {
    id: 9,
    recruiterName: 'Jane Doe',
    recruiterCompany: null,
    interactionDate: new Date('2026-08-18T00:00:00.000Z'),
    interactionType: 'email',
    historyStatus: 'pending_review' as const,
    historyStatusReason: 'uncertain' as const,
    correctedFields: [] as CorrectableField[],
    originalValues: {},
    redFlags: [],
    uncertainFlags: [unidentifiedFlag],
  };
  const certain = {
    ...uncertain,
    id: 10,
    recruiterName: 'John Smith',
    recruiterCompany: 'Acme',
    historyStatus: 'confirmed' as const,
    historyStatusReason: 'attested' as const,
    correctedFields: [] as CorrectableField[],
    originalValues: {},
    uncertainFlags: [],
  };
  const detailOf = <T extends object>(summary: T) => ({ ...summary, recruiterEmail: null, channel: null, notes: null });

  const PANEL = '<section class="uncertain-data">';
  const UNAVAILABLE_TEXT = 'Uncertain-data check is unavailable right now';

  it('lists what is uncertain, with its evidence, on the detail page -- framed as facts for a reviewer', () => {
    const html = renderDetailPage(detailOf(uncertain));

    expect(html).toContain(PANEL);
    expect(html).toContain('Uncertain data — waiting for a data reviewer');
    expect(html).toContain('not a judgment');
    expect(html).toContain(
      '<strong>Recruiter cannot be identified: no email or company recorded</strong> — Only a name is recorded: Jane Doe'
    );
    expect(html).toContain('Waiting for review: uncertain data');
  });

  it('says why it is waiting in the review section of the dashboard', () => {
    const html = renderDashboardPage({ confirmed: [], pendingReview: [uncertain] });

    expect(html).toContain('<td>Uncertain data</td>');
    expect(html).toContain('or were flagged as uncertain data');
  });

  it('shows no flag at all for certain data', () => {
    expect(renderDetailPage(detailOf(certain))).not.toContain(PANEL);
    const list = renderDashboardPage({ confirmed: [certain], pendingReview: [] });
    expect(list).not.toContain('Uncertain data');
    expect(list).not.toContain(UNAVAILABLE_TEXT);
  });

  it('says the check is unavailable, and that unchecked data is held, when uncertain flags are null', () => {
    const held = { ...certain, historyStatus: 'pending_review' as const, historyStatusReason: 'uncertainty_unchecked' as const, uncertainFlags: null };

    const list = renderDashboardPage({ confirmed: [], pendingReview: [held] });
    const page = renderDetailPage(detailOf(held));

    expect(list).toContain(UNAVAILABLE_TEXT);
    expect(list).toContain('held for review, not shown as confirmed');
    expect(list).toContain('<td>Not yet checked</td>');
    expect(page).toContain(UNAVAILABLE_TEXT);
    expect(page).not.toContain(PANEL);
  });

  it('escapes evidence, since it quotes uploaded names', () => {
    const html = renderDetailPage(
      detailOf({ ...uncertain, uncertainFlags: [{ ...unidentifiedFlag, evidence: 'Only a name is recorded: <b>x</b>' }] })
    );

    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Only a name is recorded: &lt;b&gt;x&lt;/b&gt;');
  });
});
