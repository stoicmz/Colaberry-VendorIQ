import { Router, Request, Response } from 'express';
import { listInteractions, getInteractionById } from '../services/recruiterInteractions/recruiterInteractionsService';
import { renderDashboardPage, renderDetailPage, renderErrorPage } from '../views/dashboardTemplates';

export const dashboardRouter = Router();

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
