import express from 'express';
import { vendorIngestionRouter } from './routes/vendorIngestionRoutes';
import { recruiterInteractionRouter } from './routes/recruiterInteractionRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { ensureModelsSynced } from './models/VendorIngestionRecord';

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/vendor-ingestion', vendorIngestionRouter);
  app.use('/api/interactions', recruiterInteractionRouter);
  app.use('/dashboard', dashboardRouter);
  return app;
}

function start(): void {
  const port = Number(process.env.PORT) || 3000;
  const app = buildApp();

  ensureModelsSynced()
    .then(() => {
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`VendorIQ backend listening on port ${port}`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize database models', err);
      process.exit(1);
    });
}

if (require.main === module) {
  start();
}
