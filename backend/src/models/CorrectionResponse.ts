import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// The three standard answers to a data query: the data is corrected, confirmed as it was
// entered, or the information is not available. Every one of them carries a reason.
export const CORRECTION_ANSWERS = ['corrected', 'confirmed_as_is', 'unavailable'] as const;
export type CorrectionAnswer = (typeof CORRECTION_ANSWERS)[number];

/**
 * A job seeker's attested answer to a CorrectionRequest (REQ-010). Append-only: the original
 * interaction row is never changed. A 'corrected' answer is the new attested version -- its
 * correctedValues hold only the fields that changed, as JSON -- and the current version of an
 * interaction is worked out on read from the original plus its corrections.
 *
 * One answer per request: the unique requestId makes a retried answer a no-op at the database.
 * If the answer is not good enough, the reviewer closes the request and raises a new one.
 * statement is the exact attestation wording agreed to; respondedAt is the Trust timestamp.
 */
export class CorrectionResponse extends Model<InferAttributes<CorrectionResponse>, InferCreationAttributes<CorrectionResponse>> {
  declare id: CreationOptional<number>;
  declare requestId: number;
  declare interactionId: number;
  declare answer: CorrectionAnswer;
  declare correctedValues: string | null; // JSON object of field -> new value; only for 'corrected'
  declare reason: string;
  declare respondedBy: string;
  declare statement: string;
  declare respondedAt: CreationOptional<Date>;
}

function isNonEmptyJsonObject(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
  } catch {
    return false; // not JSON at all: the caller reports it as invalid
  }
}

CorrectionResponse.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    requestId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    answer: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [[...CORRECTION_ANSWERS]] } },
    correctedValues: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    respondedBy: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
    statement: { type: DataTypes.TEXT, allowNull: false, validate: { notEmpty: true } },
    respondedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'CorrectionResponse',
    tableName: 'correction_responses',
    timestamps: false,
    indexes: [{ fields: ['interactionId'] }],
    validate: {
      // A correction must say what changed; the other two answers change nothing.
      valuesMatchAnswer(this: CorrectionResponse) {
        if (this.answer === 'corrected') {
          if (this.correctedValues === null || !isNonEmptyJsonObject(this.correctedValues)) {
            throw new Error('A corrected answer needs the new values as a non-empty JSON object');
          }
        } else if (this.correctedValues !== null) {
          throw new Error('Only a corrected answer can carry new values');
        }
      },
    },
  }
);
