import { z } from 'zod';

export const RECRUITER_INTERACTION_TYPES = [
  'email',
  'call',
  'message',
  'interview',
  'offer',
  'rejection',
  'other',
] as const;

export const recruiterInteractionSchema = z.object({
  recruiterName: z.string().trim().min(1, 'recruiterName is required').max(200),
  recruiterEmail: z.string().trim().toLowerCase().email().max(320).optional(),
  recruiterCompany: z.string().trim().max(200).optional(),
  interactionDate: z.coerce.date({
    invalid_type_error: 'interactionDate must be a valid date',
  }),
  interactionType: z.enum(RECRUITER_INTERACTION_TYPES).default('other'),
  channel: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type RecruiterInteractionType = (typeof RECRUITER_INTERACTION_TYPES)[number];
export type RecruiterInteraction = z.infer<typeof recruiterInteractionSchema>;
