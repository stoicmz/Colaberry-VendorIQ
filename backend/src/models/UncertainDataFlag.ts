import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * An interaction flagged as uncertain (STORY-005). Each row is both the data reviewer's
 * notification and the audit record of the flagging action; flaggedAt is the Trust timestamp.
 * One row per (interactionId, ruleId, rulesVersion, evidenceHash): the unique index makes
 * flagging the same thing again a no-op, while new evidence for the same rule -- or a new
 * version of the rules -- is recorded as a new flag.
 */
export class UncertainDataFlag extends Model<InferAttributes<UncertainDataFlag>, InferCreationAttributes<UncertainDataFlag>> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare ruleId: string;
  declare rulesVersion: number;
  declare description: string;
  declare evidence: string;
  declare evidenceHash: string; // sha256 of evidence, so the unique key stays short
  declare flaggedAt: CreationOptional<Date>;
}

UncertainDataFlag.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    ruleId: { type: DataTypes.STRING(50), allowNull: false },
    rulesVersion: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: false },
    evidence: { type: DataTypes.TEXT, allowNull: false },
    evidenceHash: { type: DataTypes.STRING(64), allowNull: false },
    flaggedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'UncertainDataFlag',
    tableName: 'uncertain_data_flags',
    timestamps: false,
    indexes: [{ unique: true, fields: ['interactionId', 'ruleId', 'rulesVersion', 'evidenceHash'] }],
  }
);
