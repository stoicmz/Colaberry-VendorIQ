import { Router, Request, Response } from 'express';
import {
  decideHistoryReview,
  disputeInteraction,
  InvalidHistoryReviewInputError,
  listPendingReview,
  listUncertainDataNotifications,
  NotPendingReviewError,
  UncertaintyCheckUnavailableError,
} from '../services/historyReview/historyReviewService';

// REQ-019 manual review of recruiter history: raising disputes, the review queue, and a
// data reviewer's ruling. JSON API; identities are required free-text IDs, as elsewhere,
// because there is no login yet.
export const historyReviewRouter = Router();

function parseInteractionId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bodyText(req: Request, field: string): string {
  const value = req.body?.[field];
  return typeof value === 'string' ? value : '';
}

historyReviewRouter.post('/interactions/:id/dispute', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Interaction id must be a positive integer.' });
    return;
  }

  try {
    const result = await disputeInteraction({
      interactionId: id,
      disputedBy: bodyText(req, 'disputedBy'),
      reason: bodyText(req, 'reason'),
    });
    if (!result) {
      res.status(404).json({ error: `No interaction found with id ${id}.` });
      return;
    }
    // 201 for a new dispute; 200 when this person's open dispute already existed.
    res.status(result.created ? 201 : 200).json({ dispute: result });
  } catch (err) {
    if (err instanceof InvalidHistoryReviewInputError) {
      res.status(400).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to record interaction dispute', err);
    res.status(500).json({ error: 'Failed to record the dispute.' });
  }
});

historyReviewRouter.get('/queue', async (_req: Request, res: Response) => {
  try {
    const items = await listPendingReview();
    res.status(200).json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load the history review queue', err);
    res.status(500).json({ error: 'Failed to load the review queue.' });
  }
});

// STORY-005: a data reviewer's open uncertain-data notifications.
historyReviewRouter.get('/notifications', async (_req: Request, res: Response) => {
  try {
    const result = await listUncertainDataNotifications();
    res.status(200).json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load uncertain-data notifications', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

historyReviewRouter.post('/interactions/:id/decision', async (req: Request, res: Response) => {
  const id = parseInteractionId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Interaction id must be a positive integer.' });
    return;
  }

  const note = bodyText(req, 'note');
  try {
    const result = await decideHistoryReview({
      interactionId: id,
      reviewerId: bodyText(req, 'reviewerId'),
      decision: bodyText(req, 'decision'),
      note: note === '' ? null : note,
    });
    if (!result) {
      res.status(404).json({ error: `No interaction found with id ${id}.` });
      return;
    }
    res.status(200).json({ decision: result });
  } catch (err) {
    if (err instanceof InvalidHistoryReviewInputError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof NotPendingReviewError) {
      res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
      return;
    }
    if (err instanceof UncertaintyCheckUnavailableError) {
      res.status(503).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Failed to record history review decision', err);
    res.status(500).json({ error: 'Failed to record the decision.' });
  }
});
