import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export const INGESTION_AUDIT_OUTCOMES = ['success', 'duplicate', 'rejected'] as const;
export type IngestionAuditOutcome = (typeof INGESTION_AUDIT_OUTCOMES)[number];

export class IngestionAuditLog extends Model<
  InferAttributes<IngestionAuditLog>,
  InferCreationAttributes<IngestionAuditLog>
> {
  declare id: CreationOptional<number>;
  declare correlationId: string;
  declare outcome: IngestionAuditOutcome;
  declare fileName: string | null;
  declare fileHash: string | null;
  declare format: string | null;
  declare batchId: number | null;
  declare totalRows: number | null;
  declare validCount: number | null;
  declare errorCount: number | null;
  declare errorMessage: string | null;
  declare createdAt: CreationOptional<Date>;
}

IngestionAuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    correlationId: { type: DataTypes.STRING(36), allowNull: false },
    outcome: { type: DataTypes.STRING(20), allowNull: false },
    fileName: { type: DataTypes.STRING(255), allowNull: true },
    fileHash: { type: DataTypes.STRING(64), allowNull: true },
    format: { type: DataTypes.STRING(10), allowNull: true },
    batchId: { type: DataTypes.INTEGER, allowNull: true },
    totalRows: { type: DataTypes.INTEGER, allowNull: true },
    validCount: { type: DataTypes.INTEGER, allowNull: true },
    errorCount: { type: DataTypes.INTEGER, allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'IngestionAuditLog', tableName: 'ingestion_audit_logs', timestamps: false }
);
