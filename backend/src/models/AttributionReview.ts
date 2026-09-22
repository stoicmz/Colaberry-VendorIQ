import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export const ATTRIBUTION_REVIEW_ACTIONS = ['confirmed', 'corrected'] as const;
export type AttributionReviewAction = (typeof ATTRIBUTION_REVIEW_ACTIONS)[number];

export class AttributionReview extends Model<InferAttributes<AttributionReview>, InferCreationAttributes<AttributionReview>> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare reviewerId: string;
  declare action: AttributionReviewAction;
  declare previousRecruiterName: string;
  declare previousRecruiterCompany: string | null;
  declare newRecruiterName: string;
  declare newRecruiterCompany: string | null;
  declare reviewedAt: CreationOptional<Date>;
}

AttributionReview.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    reviewerId: { type: DataTypes.STRING(200), allowNull: false },
    action: { type: DataTypes.STRING(20), allowNull: false },
    previousRecruiterName: { type: DataTypes.STRING(200), allowNull: false },
    previousRecruiterCompany: { type: DataTypes.STRING(200), allowNull: true },
    newRecruiterName: { type: DataTypes.STRING(200), allowNull: false },
    newRecruiterCompany: { type: DataTypes.STRING(200), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'AttributionReview', tableName: 'attribution_reviews', timestamps: false }
);
