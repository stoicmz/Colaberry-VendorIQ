import path from 'path';
import { Sequelize } from 'sequelize';

function resolveStoragePath(): string {
  if (process.env.DB_STORAGE_PATH) {
    return process.env.DB_STORAGE_PATH;
  }
  if (process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  return path.join(__dirname, '..', '..', 'vendoriq-dev.sqlite');
}

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: resolveStoragePath(),
  logging: false,
});
