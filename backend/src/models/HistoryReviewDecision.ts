import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export const HISTORY_REVIEW_DECISIONS = ['confirmed', 'rejected'] as const;
export type HistoryReviewDecisionType = (typeof HISTORY_REVIEW_DECISIONS)[number];

/**
 * A data reviewer's ruling on an interaction that was routed to manual review (REQ-019):
 * either it may be shown as confirmed recruiter history, or it may not. Rows are append-only;
 * the most recent decision (highest id) for an interaction is the one in force.
 */
export class HistoryReviewDecision extends Model<
  InferAttributes<HistoryReviewDecision>,
  InferCreationAttributes<HistoryReviewDecision>
> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare reviewerId: string;
  declare decision: HistoryReviewDecisionType;
  declare note: string | null;
  declare decidedAt: CreationOptional<Date>;
}

HistoryReviewDecision.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    reviewerId: { type: DataTypes.STRING(200), allowNull: false },
    decision: { type: DataTypes.STRING(20), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'HistoryReviewDecision',
    tableName: 'history_review_decisions',
    timestamps: false,
    indexes: [{ fields: ['interactionId'] }],
  }
);
