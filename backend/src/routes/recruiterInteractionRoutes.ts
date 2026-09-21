import { Router, Request, Response } from 'express';
import { listInteractions, getInteractionById } from '../services/recruiterInteractions/recruiterInteractionsService';

export const recruiterInteractionRouter = Router();

recruiterInteractionRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const interactions = await listInteractions();
    res.status(200).json({ interactions });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load recruiter interactions', err);
    res.status(500).json({ error: 'Failed to load recruiter interactions.' });
  }
});

recruiterInteractionRouter.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Interaction id must be a positive integer.' });
    return;
  }

  try {
    const interaction = await getInteractionById(id);
    if (!interaction) {
      res.status(404).json({ error: `No interaction found with id ${id}.` });
      return;
    }
    res.status(200).json({ interaction });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load recruiter interaction detail', err);
    res.status(500).json({ error: 'Failed to load recruiter interaction detail.' });
  }
});
