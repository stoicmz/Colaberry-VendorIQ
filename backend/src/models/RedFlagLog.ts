import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Audit trail for red flag identification (STORY-004 Trust criterion). One row per
 * (interactionId, ruleId, rulesVersion, evidenceHash): the unique index makes showing the
 * same flag again a no-op, while new evidence for the same rule -- or a new version of the
 * rules -- is recorded as a new identification. identifiedAt is the Trust timestamp.
 */
export class RedFlagLog extends Model<InferAttributes<RedFlagLog>, InferCreationAttributes<RedFlagLog>> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare ruleId: string;
  declare rulesVersion: number;
  declare evidence: string;
  declare evidenceHash: string; // sha256 of evidence, so the unique key stays short
  declare identifiedAt: CreationOptional<Date>;
}

RedFlagLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    ruleId: { type: DataTypes.STRING(50), allowNull: false },
    rulesVersion: { type: DataTypes.INTEGER, allowNull: false },
    evidence: { type: DataTypes.TEXT, allowNull: false },
    evidenceHash: { type: DataTypes.STRING(64), allowNull: false },
    identifiedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'RedFlagLog',
    tableName: 'red_flag_logs',
    timestamps: false,
    indexes: [{ unique: true, fields: ['interactionId', 'ruleId', 'rulesVersion', 'evidenceHash'] }],
  }
);
