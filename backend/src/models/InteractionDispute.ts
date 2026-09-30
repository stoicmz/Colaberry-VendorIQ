import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Someone saying an ingested interaction is not factual (REQ-019). While a dispute is open
 * (resolvedByDecisionId is null) the interaction is routed to manual review and is never
 * shown as confirmed recruiter history. A reviewer's HistoryReviewDecision closes it by
 * stamping its own id here -- an explicit link, rather than comparing timestamps.
 */
export class InteractionDispute extends Model<InferAttributes<InteractionDispute>, InferCreationAttributes<InteractionDispute>> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare disputedBy: string;
  declare reason: string;
  declare resolvedByDecisionId: number | null;
  declare disputedAt: CreationOptional<Date>;
}

InteractionDispute.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    disputedBy: { type: DataTypes.STRING(200), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    resolvedByDecisionId: { type: DataTypes.INTEGER, allowNull: true },
    disputedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'InteractionDispute',
    tableName: 'interaction_disputes',
    timestamps: false,
    indexes: [{ fields: ['interactionId'] }],
  }
);
