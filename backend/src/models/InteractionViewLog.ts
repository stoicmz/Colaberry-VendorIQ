import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export class InteractionViewLog extends Model<
  InferAttributes<InteractionViewLog>,
  InferCreationAttributes<InteractionViewLog>
> {
  declare id: CreationOptional<number>;
  declare interactionId: number;
  declare viewedAt: CreationOptional<Date>;
}

InteractionViewLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    interactionId: { type: DataTypes.INTEGER, allowNull: false },
    viewedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'InteractionViewLog', tableName: 'interaction_view_logs', timestamps: false }
);
