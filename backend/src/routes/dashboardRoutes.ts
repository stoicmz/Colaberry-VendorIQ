import { Router, Request, Response } from 'express';
import { listInteractions, getInteractionById } from '../services/recruiterInteractions/recruiterInteractionsService';
import {
  InvalidAttributionError,
  MissingReviewerIdError,
  reviewRecruiterAttribution,
} from '../services/attributionReview/attributionReviewService';
import { renderDashboardPage, renderDetailPage, renderErrorPage, renderReviewForm } from '../views/dashboardTemplates';

export const dashboardRouter = Router();

function parseInteractionId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

dashboardRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const interactions = await listInteractions();
    res.status(200).send(renderDashboardPage(interactions));
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
    res.status(200).send(renderDetailPage(interaction));
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
