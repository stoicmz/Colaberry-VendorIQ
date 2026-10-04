import { Router, Request, Response } from 'express';
import {
  CorrectionRequestNotOpenError,
  InvalidCorrectionRequestInputError,
  listOpenCorrectionRequests,
  NotSubmissionOwnerError,
  raiseCorrectionRequest,
  respondToCorrectionRequest,
  withdrawCorrectionRequest,
} from '../services/correctionRequest/correctionRequestService';

// STORY-011 / REQ-010 correction requests: a data reviewer asks, the job seeker answers with an
// attested correction, confirmation or "unavailable", and the reviewer rules (via history review).
// JSON API; identities are required free-text IDs, as elsewhere, because there is no login yet.
export const correctionRequestRouter = Router();

function parsePositiveInt(raw: unknown): number | null {
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bodyText(req: Request, field: string): string {
  const value = req.body?.[field];
  return typeof value === 'string' ? value : '';
}

// Maps the service's refusals to HTTP codes; anything else is logged and becomes a 500.
function sendError(res: Response, err: unknown, failureLog: string, failureMessage: string): void {
  if (err instanceof InvalidCorrectionRequestInputError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof NotSubmissionOwnerError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof CorrectionRequestNotOpenError) {
    res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(failureLog, err);
  res.status(500).json({ error: failureMessage });
}

// A data reviewer asks the job seeker to correct or complete one field of an interaction.
correctionRequestRouter.post('/', async (req: Request, res: Response) => {
  const interactionId = parsePositiveInt(req.body?.interactionId);
  if (interactionId === null) {
    res.status(400).json({ error: 'interactionId must be a positive integer.' });
    return;
  }
  try {
    const result = await raiseCorrectionRequest({
      interactionId,
      reviewerId: bodyText(req, 'reviewerId'),
      field: bodyText(req, 'field'),
      reason: bodyText(req, 'reason'),
    });
    if (!result) {
      res.status(404).json({ error: `No interaction found with id ${interactionId}.` });
      return;
    }
    // 201 for a new request; 200 when a live request for this field already existed.
    res.status(result.created ? 201 : 200).json({ request: result });
  } catch (err) {
    sendError(res, err, 'Failed to raise correction request', 'Failed to raise the correction request.');
  }
});

// The job seeker's list: every request still waiting for an answer, and whom it is for.
correctionRequestRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ items: await listOpenCorrectionRequests() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load open correction requests', err);
    res.status(500).json({ error: 'Failed to load correction requests.' });
  }
});

// The job seeker's attested answer.
correctionRequestRouter.post('/:id/response', async (req: Request, res: Response) => {
  const requestId = parsePositiveInt(req.params.id);
  if (requestId === null) {
    res.status(400).json({ error: 'Request id must be a positive integer.' });
    return;
  }
  const correctedValues = req.body?.correctedValues;
  if (correctedValues !== undefined && correctedValues !== null && (typeof correctedValues !== 'object' || Array.isArray(correctedValues))) {
    res.status(400).json({ error: 'correctedValues must be an object of field to new value.' });
    return;
  }
  try {
    const result = await respondToCorrectionRequest({
      requestId,
      respondedBy: bodyText(req, 'respondedBy'),
      answer: bodyText(req, 'answer'),
      reason: bodyText(req, 'reason'),
      correctedValues: correctedValues ?? null,
      // Only an explicit true counts as agreeing to the attestation.
      attestationAccepted: req.body?.attestationAccepted === true,
    });
    if (!result) {
      res.status(404).json({ error: `No correction request found with id ${requestId}.` });
      return;
    }
    // 201 for a new answer; 200 when this exact answer had already been recorded.
    res.status(result.created ? 201 : 200).json({ response: result });
  } catch (err) {
    sendError(res, err, 'Failed to record correction response', 'Failed to record your answer.');
  }
});

// A data reviewer withdraws a request still waiting on the job seeker, with a reason.
correctionRequestRouter.post('/:id/withdraw', async (req: Request, res: Response) => {
  const requestId = parsePositiveInt(req.params.id);
  if (requestId === null) {
    res.status(400).json({ error: 'Request id must be a positive integer.' });
    return;
  }
  try {
    const result = await withdrawCorrectionRequest({
      requestId,
      reviewerId: bodyText(req, 'reviewerId'),
      reason: bodyText(req, 'reason'),
    });
    if (!result) {
      res.status(404).json({ error: `No correction request found with id ${requestId}.` });
      return;
    }
    res.status(200).json({ withdrawal: result });
  } catch (err) {
    sendError(res, err, 'Failed to withdraw correction request', 'Failed to withdraw the correction request.');
  }
});
