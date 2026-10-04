import { Router, Request, Response } from 'express';
import { listInteractions, getInteractionById } from '../services/recruiterInteractions/recruiterInteractionsService';
import {
  InvalidAttributionError,
  MissingReviewerIdError,
  reviewRecruiterAttribution,
} from '../services/attributionReview/attributionReviewService';
import {
  CORRECTION_ATTESTATION_STATEMENT,
  CorrectionRequestNotOpenError,
  InvalidCorrectionRequestInputError,
  listCorrectionRequestsForInteraction,
  listOpenCorrectionRequests,
  NotSubmissionOwnerError,
  OpenCorrectionRequestItem,
  raiseCorrectionRequest,
  respondToCorrectionRequest,
  withdrawCorrectionRequest,
} from '../services/correctionRequest/correctionRequestService';
import { CorrectableField } from '../models/CorrectionRequest';
import { CorrectionRequest } from '../models/CorrectionRequest';
import {
  AwaitingJobSeekerError,
  decideHistoryReview,
  InvalidHistoryReviewInputError,
  NotPendingReviewError,
  UncertaintyCheckUnavailableError,
} from '../services/historyReview/historyReviewService';
import {
  AnswerFormValues,
  DecisionFormValues,
  inputValue,
  renderAnswerForm,
  renderDashboardPage,
  renderDetailPage,
  renderErrorPage,
  renderRequestCorrectionForm,
  renderRequestsPage,
  renderReviewForm,
} from '../views/dashboardTemplates';

export const dashboardRouter = Router();

function parseInteractionId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

dashboardRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const interactions = await listInteractions();
    // A failure to count requests must not take the dashboard down; the page says it could not check.
    let openRequestCount: number | undefined;
    try {
      openRequestCount = (await listOpenCorrectionRequests()).length;
    } catch (requestErr) {
      // eslint-disable-next-line no-console
      console.error('Failed to count open correction requests for the dashboard', requestErr);
    }
    res
      .status(200)
      .send(renderDashboardPage(interactions, { openRequestCount, requestsUnavailable: openRequestCount === undefined }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load dashboard', err);
    res
      .status(500)
      .send(renderErrorPage('Dashboard unavailable', 'We could not load your recruiter interactions. Please try again shortly.'));
  }
});

dashboardRouter.get('/interactions/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }

  try {
    const interaction = await getInteractionById(id);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    const requests = await listCorrectionRequestsForInteraction(id);
    res.status(200).send(renderDetailPage(interaction, { requests }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load interaction detail', err);
    res
      .status(500)
      .send(renderErrorPage('Interaction detail unavailable', 'We could not load this interaction. Please try again shortly.'));
  }
});

dashboardRouter.get('/interactions/:id/review', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }

  try {
    const interaction = await getInteractionById(id);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.status(200).send(renderReviewForm(interaction));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load interaction for review', err);
    res
      .status(500)
      .send(renderErrorPage('Review unavailable', 'We could not load this interaction for review. Please try again shortly.'));
  }
});

dashboardRouter.post('/interactions/:id/review', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }

  const reviewerId = typeof req.body?.reviewerId === 'string' ? req.body.reviewerId : '';
  const recruiterName = typeof req.body?.recruiterName === 'string' ? req.body.recruiterName : '';
  const recruiterCompany = typeof req.body?.recruiterCompany === 'string' ? req.body.recruiterCompany : '';

  async function reRenderFormWithError(status: number, error: string): Promise<void> {
    const interaction = await getInteractionById(id as number);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.status(status).send(renderReviewForm(interaction, { error, values: { reviewerId, recruiterName, recruiterCompany } }));
  }

  try {
    const result = await reviewRecruiterAttribution({
      interactionId: id,
      reviewerId,
      recruiterName,
      recruiterCompany: recruiterCompany === '' ? null : recruiterCompany,
    });

    if (!result) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }

    res.redirect(303, `/dashboard/interactions/${id}`);
  } catch (err) {
    if (err instanceof MissingReviewerIdError || err instanceof InvalidAttributionError) {
      await reRenderFormWithError(400, err.message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to save attribution review', err);
    await reRenderFormWithError(500, 'We could not save your review. Please try again.');
  }
});

// STORY-011: a data reviewer asks the job seeker to correct or complete a field.
dashboardRouter.get('/interactions/:id/request-correction', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }

  try {
    const interaction = await getInteractionById(id);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.status(200).send(renderRequestCorrectionForm(interaction));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load the correction request form', err);
    res
      .status(500)
      .send(renderErrorPage('Request unavailable', 'We could not load this interaction. Please try again shortly.'));
  }
});

dashboardRouter.post('/interactions/:id/request-correction', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }

  const values = {
    reviewerId: typeof req.body?.reviewerId === 'string' ? req.body.reviewerId : '',
    field: typeof req.body?.field === 'string' ? req.body.field : '',
    reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
  };

  async function reRenderFormWithError(status: number, error: string): Promise<void> {
    const interaction = await getInteractionById(id as number);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.status(status).send(renderRequestCorrectionForm(interaction, { error, values }));
  }

  try {
    const result = await raiseCorrectionRequest({ interactionId: id, ...values });
    if (!result) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.redirect(303, `/dashboard/interactions/${id}`);
  } catch (err) {
    if (err instanceof InvalidCorrectionRequestInputError) {
      await reRenderFormWithError(400, err.message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to raise correction request', err);
    await reRenderFormWithError(500, 'We could not send your request. Please try again.');
  }
});

// STORY-011: a data reviewer withdraws a request still waiting on the job seeker, landing back
// on (or seeing the error on) the page of the interaction the request is about.
dashboardRouter.post('/correction-requests/:id/withdraw', async (req: Request, res: Response) => {
  const requestId = parseInteractionId(req.params.id);
  if (requestId === null) {
    res.status(400).send(renderErrorPage('Invalid request', 'That withdrawal link is not valid.'));
    return;
  }

  async function reRenderDetailWithError(status: number, error: string): Promise<void> {
    const request = await CorrectionRequest.findByPk(requestId as number);
    const interaction = request ? await getInteractionById(request.interactionId) : null;
    if (!request || !interaction) {
      res.status(404).send(renderErrorPage('Request not found', `No correction request found with id ${requestId}.`));
      return;
    }
    const requests = await listCorrectionRequestsForInteraction(interaction.id);
    res.status(status).send(renderDetailPage(interaction, { requests, error }));
  }

  try {
    const result = await withdrawCorrectionRequest({
      requestId,
      reviewerId: typeof req.body?.reviewerId === 'string' ? req.body.reviewerId : '',
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
    });
    if (!result) {
      res.status(404).send(renderErrorPage('Request not found', `No correction request found with id ${requestId}.`));
      return;
    }
    res.redirect(303, `/dashboard/interactions/${result.interactionId}`);
  } catch (err) {
    if (err instanceof InvalidCorrectionRequestInputError) {
      await reRenderDetailWithError(400, err.message);
      return;
    }
    if (err instanceof CorrectionRequestNotOpenError) {
      await reRenderDetailWithError(409, err.message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to withdraw correction request', err);
    await reRenderDetailWithError(500, 'We could not withdraw the request. Please try again.');
  }
});

// STORY-011: the job seeker's list of requests waiting for their answer.
dashboardRouter.get('/requests', async (req: Request, res: Response) => {
  try {
    const items = await listOpenCorrectionRequests();
    res.status(200).send(renderRequestsPage(items, { answered: req.query.answered === '1' }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load correction requests', err);
    res
      .status(500)
      .send(renderErrorPage('Requests unavailable', 'We could not load your requests. Please try again shortly.'));
  }
});

// The open request with this id; when it is not open, a page saying why (answered, closed, or unknown).
async function findOpenRequest(
  requestId: number,
  res: Response
): Promise<OpenCorrectionRequestItem | null> {
  const item = (await listOpenCorrectionRequests()).find((open) => open.requestId === requestId);
  if (item) {
    return item;
  }
  const stored = await CorrectionRequest.findByPk(requestId);
  if (!stored) {
    res.status(404).send(renderErrorPage('Request not found', `No correction request found with id ${requestId}.`));
  } else {
    res
      .status(409)
      .send(
        renderErrorPage(
          'Request already answered',
          'This request is no longer waiting for an answer. It has already been answered, or a reviewer has closed it.'
        )
      );
  }
  return null;
}

dashboardRouter.get('/requests/:id', async (req: Request, res: Response) => {
  const requestId = parseInteractionId(req.params.id);
  if (requestId === null) {
    res.status(400).send(renderErrorPage('Invalid request', 'That request link is not valid.'));
    return;
  }
  try {
    const item = await findOpenRequest(requestId, res);
    if (item) {
      res.status(200).send(renderAnswerForm(item, CORRECTION_ATTESTATION_STATEMENT));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load the answer form', err);
    res.status(500).send(renderErrorPage('Request unavailable', 'We could not load this request. Please try again shortly.'));
  }
});

dashboardRouter.post('/requests/:id', async (req: Request, res: Response) => {
  const requestId = parseInteractionId(req.params.id);
  if (requestId === null) {
    res.status(400).send(renderErrorPage('Invalid request', 'That request link is not valid.'));
    return;
  }
  const text = (field: string) => (typeof req.body?.[field] === 'string' ? req.body[field] : '');

  try {
    const item = await findOpenRequest(requestId, res);
    if (!item) {
      return;
    }

    const fieldValues: Partial<Record<CorrectableField, string>> = {};
    for (const field of item.fields) {
      fieldValues[field] = text(`value_${field}`);
    }
    const values: AnswerFormValues = {
      respondedBy: text('respondedBy'),
      answer: text('answer'),
      reason: text('reason'),
      fieldValues,
      attested: text('attest') === 'yes',
    };

    // Only a correction carries values, and only the ones the job seeker actually changed: the
    // inputs start filled with the current values, and blank ones mean "no new value".
    let correctedValues: Record<string, string> | null = null;
    if (values.answer === 'corrected') {
      correctedValues = {};
      for (const field of item.fields) {
        const entered = (fieldValues[field] ?? '').trim();
        if (entered !== '' && entered !== inputValue(field, item.currentValues[field])) {
          correctedValues[field] = entered;
        }
      }
    }

    try {
      const result = await respondToCorrectionRequest({
        requestId,
        respondedBy: values.respondedBy ?? '',
        answer: values.answer ?? '',
        reason: values.reason ?? '',
        correctedValues,
        attestationAccepted: values.attested === true,
      });
      if (!result) {
        res.status(404).send(renderErrorPage('Request not found', `No correction request found with id ${requestId}.`));
        return;
      }
      res.redirect(303, '/dashboard/requests?answered=1');
    } catch (err) {
      let status = 500;
      let message = 'We could not send your answer. Please try again.';
      if (err instanceof InvalidCorrectionRequestInputError) {
        status = 400;
        message = err.message;
      } else if (err instanceof NotSubmissionOwnerError) {
        status = 403;
        message = err.message;
      } else if (err instanceof CorrectionRequestNotOpenError) {
        status = 409;
        message = err.message;
      } else {
        // eslint-disable-next-line no-console
        console.error('Failed to record correction answer', err);
      }
      res.status(status).send(renderAnswerForm(item, CORRECTION_ATTESTATION_STATEMENT, { error: message, values }));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load the request being answered', err);
    res.status(500).send(renderErrorPage('Request unavailable', 'We could not load this request. Please try again shortly.'));
  }
});

// STORY-011 / REQ-019: a data reviewer's ruling from the interaction page. It calls the same
// decideHistoryReview as the JSON API, so every rule (and the closing of requests) applies.
dashboardRouter.post('/interactions/:id/decision', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).send(renderErrorPage('Invalid interaction', 'That interaction link is not valid.'));
    return;
  }
  const text = (field: string) => (typeof req.body?.[field] === 'string' ? req.body[field] : '');
  const values: DecisionFormValues = { reviewerId: text('reviewerId'), decision: text('decision'), note: text('note') };

  async function reRenderDetailWithError(status: number, decisionError: string): Promise<void> {
    const interaction = await getInteractionById(id as number);
    if (!interaction) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    const requests = await listCorrectionRequestsForInteraction(id as number);
    res.status(status).send(renderDetailPage(interaction, { requests, decisionError, decisionValues: values }));
  }

  try {
    const result = await decideHistoryReview({
      interactionId: id,
      reviewerId: values.reviewerId ?? '',
      decision: values.decision ?? '',
      note: values.note === '' ? null : values.note ?? null,
    });
    if (!result) {
      res.status(404).send(renderErrorPage('Interaction not found', `No interaction found with id ${id}.`));
      return;
    }
    res.redirect(303, `/dashboard/interactions/${id}`);
  } catch (err) {
    if (err instanceof InvalidHistoryReviewInputError) {
      await reRenderDetailWithError(400, err.message);
      return;
    }
    if (err instanceof NotPendingReviewError || err instanceof AwaitingJobSeekerError) {
      await reRenderDetailWithError(409, err.message);
      return;
    }
    if (err instanceof UncertaintyCheckUnavailableError) {
      await reRenderDetailWithError(503, err.message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to record reviewer ruling', err);
    await reRenderDetailWithError(500, 'We could not record your ruling. Please try again.');
  }
});
