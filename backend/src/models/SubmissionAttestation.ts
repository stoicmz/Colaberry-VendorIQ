import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// How the attested data arrived. Only 'file' exists today (the STORY-001 upload); 'form'
// is reserved for a future in-app submission form so it can reuse this record unchanged.
export const ATTESTATION_CHANNELS = ['file', 'form'] as const;
export type AttestationChannel = (typeof ATTESTATION_CHANNELS)[number];

/**
 * A job seeker's statement that the interaction data they submitted is factual (REQ-019).
 * One row per (batchId, attestedBy): the unique index makes a retried or repeated
 * submission by the same person a no-op instead of a second attestation, while a different
 * person attesting the same batch is still recorded. attestedAt is the Trust timestamp.
 */
export class SubmissionAttestation extends Model<
  InferAttributes<SubmissionAttestation>,
  InferCreationAttributes<SubmissionAttestation>
> {
  declare id: CreationOptional<number>;
  declare batchId: number;
  declare correlationId: string;
  declare attestedBy: string;
  declare statement: string;
  declare channel: AttestationChannel;
  declare fileHash: string | null;
  declare attestedAt: CreationOptional<Date>;
}

SubmissionAttestation.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    batchId: { type: DataTypes.INTEGER, allowNull: false },
    correlationId: { type: DataTypes.STRING(36), allowNull: false },
    attestedBy: { type: DataTypes.STRING(200), allowNull: false },
    // The exact wording the job seeker agreed to, so a later change to the wording
    // never rewrites what an earlier submitter actually attested.
    statement: { type: DataTypes.TEXT, allowNull: false },
    channel: { type: DataTypes.STRING(10), allowNull: false },
    fileHash: { type: DataTypes.STRING(64), allowNull: true },
    attestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'SubmissionAttestation',
    tableName: 'submission_attestations',
    timestamps: false,
    indexes: [{ unique: true, fields: ['batchId', 'attestedBy'] }],
  }
);
