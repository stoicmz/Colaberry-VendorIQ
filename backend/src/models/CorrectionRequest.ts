import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// The interaction fields a job seeker can be asked to correct or complete.
export const CORRECTABLE_FIELDS = [
  'recruiterName',
  'recruiterEmail',
  'recruiterCompany',
  'interactionDate',
  'interactionType',
  'channel',
  'notes',
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

// Who raised the request: a STORY-005 rule ('system') or a data reviewer with a reason.
export const CORRECTION_REQUEST_RAISERS = ['system', 'reviewer'] as const;
export type CorrectionRequestRaiser = (typeof CORRECTION_REQUEST_RAISERS)[number];

// open: waiting for the job seeker. answered: back with the data reviewer. closed: the reviewer
// ruled on the interaction, or withdrew the request before it was answered.
export const CORRECTION_REQUEST_STATUSES = ['open', 'answered', 'closed'] as const;
export type CorrectionRequestStatus = (typeof CORRECTION_REQUEST_STATUSES)[number];

/**
 * A request for the job seeker to correct or complete an interaction they submitted (REQ-010).
 * Data reviewers never change submitted data themselves: they -- or a rule -- ask the job
 * seeker, who answers with a new attested version, and the reviewer then rules on it.
 *
 * openKey holds issueKey while the request is not closed and null once it is. The unique index
 * on (interactionId, openKey) lets the database enforce one live request per issue -- a retried
 * or repeated raise is refused -- while the same issue can be raised again after closing,
 * because null values never collide. raisedAt is the Trust timestamp for raising it.
 *
 * Closing is logged on the row: closedBy and closedAt always, plus either closedByDecisionId
 * (the reviewer's ruling that closed it) or closeReason (why it was withdrawn) -- never both.
 */
export class CorrectionRequest extends Model<InferAttributes<CorrectionRequest>, InferCreationAttributes<CorrectionRequest>> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare issueKey: string; // e.g. 'rule:unidentified_recruiter' or 'reviewer:recruiterCompany'
  declare raisedByType: CorrectionRequestRaiser;
  declare raisedBy: string; // the reviewer ID, or 'system'
  declare reason: string; // what is missing or wrong, and why
  declare status: CreationOptional<CorrectionRequestStatus>;
  declare openKey: string | null;
  declare raisedAt: CreationOptional<Date>;
  declare closedBy: CreationOptional<string | null>;
  declare closedAt: CreationOptional<Date | null>;
  declare closedByDecisionId: CreationOptional<number | null>;
  declare closeReason: CreationOptional<string | null>;
}

CorrectionRequest.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    issueKey: { type: DataTypes.STRING(100), allowNull: false, validate: { notEmpty: true } },
    raisedByType: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { isIn: [[...CORRECTION_REQUEST_RAISERS]] },
    },
    raisedBy: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
    reason: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    status: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'open',
      validate: { isIn: [[...CORRECTION_REQUEST_STATUSES]] },
    },
    openKey: { type: DataTypes.STRING(100), allowNull: true },
    raisedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closedBy: { type: DataTypes.STRING(200), allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    closedByDecisionId: { type: DataTypes.INTEGER, allowNull: true },
    closeReason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'CorrectionRequest',
    tableName: 'correction_requests',
    timestamps: false,
    indexes: [{ unique: true, fields: ['interactionId', 'openKey'] }],
    validate: {
      // Keeps the uniqueness guarantee honest: a live request must carry its key, a closed one must not.
      openKeyMatchesStatus(this: CorrectionRequest) {
        const expected = (this.status ?? 'open') === 'closed' ? null : this.issueKey;
        if (this.openKey !== expected) {
          throw new Error('openKey must equal issueKey until the request is closed, then null');
        }
      },
      // A closed request must say who closed it, when, and how; a live one must not.
      closingIsLogged(this: CorrectionRequest) {
        const closed = (this.status ?? 'open') === 'closed';
        const hasDecision = this.closedByDecisionId != null;
        const hasReason = this.closeReason != null && this.closeReason.trim() !== '';
        if (!closed) {
          if (this.closedBy != null || this.closedAt != null || hasDecision || this.closeReason != null) {
            throw new Error('Only a closed request can carry closing details');
          }
          return;
        }
        if (!this.closedBy || this.closedBy.trim() === '' || !this.closedAt) {
          throw new Error('A closed request must record who closed it and when');
        }
        if (hasDecision === hasReason) {
          throw new Error('A closed request must name either the decision that closed it or a withdrawal reason');
        }
      },
    },
  }
);
