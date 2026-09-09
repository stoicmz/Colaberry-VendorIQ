import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../config/database';
import { RecruiterInteractionType } from '../services/vendorIngestion/vendorIngestionSchema';
import './IngestionAuditLog';

export class IngestionBatch extends Model<InferAttributes<IngestionBatch>, InferCreationAttributes<IngestionBatch>> {
  declare id: CreationOptional<number>;
  declare fileHash: string;
  declare fileName: string;
  declare totalRows: number;
  declare validCount: number;
  declare errorCount: number;
  declare createdAt: CreationOptional<Date>;
}

IngestionBatch.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fileHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    totalRows: { type: DataTypes.INTEGER, allowNull: false },
    validCount: { type: DataTypes.INTEGER, allowNull: false },
    errorCount: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'IngestionBatch', tableName: 'ingestion_batches', timestamps: false }
);

export class RecruiterInteractionRecord extends Model<
  InferAttributes<RecruiterInteractionRecord>,
  InferCreationAttributes<RecruiterInteractionRecord>
> {
  declare id: CreationOptional<number>;
  declare batchId: ForeignKey<IngestionBatch['id']>;
  declare recruiterName: string;
  declare recruiterEmail: string | null;
  declare recruiterCompany: string | null;
  declare interactionDate: Date;
  declare interactionType: RecruiterInteractionType;
  declare channel: string | null;
  declare notes: string | null;
  declare createdAt: CreationOptional<Date>;
}

RecruiterInteractionRecord.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    batchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: IngestionBatch, key: 'id' },
    },
    recruiterName: { type: DataTypes.STRING(200), allowNull: false },
    recruiterEmail: { type: DataTypes.STRING(320), allowNull: true },
    recruiterCompany: { type: DataTypes.STRING(200), allowNull: true },
    interactionDate: { type: DataTypes.DATE, allowNull: false },
    // Stored as STRING rather than DataTypes.ENUM: the value is already constrained by
    // recruiterInteractionSchema (Zod) before it reaches this layer, and Sequelize's
    // sqlite dialect emulates ENUM with a CHECK constraint that just duplicates that rule.
    interactionType: { type: DataTypes.STRING(20), allowNull: false },
    channel: { type: DataTypes.STRING(100), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'RecruiterInteractionRecord', tableName: 'recruiter_interaction_records', timestamps: false }
);

IngestionBatch.hasMany(RecruiterInteractionRecord, { foreignKey: 'batchId' });
RecruiterInteractionRecord.belongsTo(IngestionBatch, { foreignKey: 'batchId' });

let syncPromise: Promise<void> | null = null;

export function ensureModelsSynced(): Promise<void> {
  if (!syncPromise) {
    syncPromise = sequelize.sync().then(() => undefined);
  }
  return syncPromise;
}
