import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { CleaningActionType } from '../services/dataCleaning/dataCleaningService';

export class DataCleaningLog extends Model<InferAttributes<DataCleaningLog>, InferCreationAttributes<DataCleaningLog>> {
  declare id: CreationOptional<number>;
  declare correlationId: string;
  declare administratorId: string;
  declare rowNumber: number;
  declare action: CleaningActionType;
  declare field: string | null;
  declare detail: string;
  declare cleanedAt: CreationOptional<Date>;
}

DataCleaningLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    correlationId: { type: DataTypes.STRING(36), allowNull: false },
    administratorId: { type: DataTypes.STRING(200), allowNull: false },
    rowNumber: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(20), allowNull: false },
    field: { type: DataTypes.STRING(100), allowNull: true },
    detail: { type: DataTypes.TEXT, allowNull: false },
    cleanedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'DataCleaningLog', tableName: 'data_cleaning_logs', timestamps: false }
);
