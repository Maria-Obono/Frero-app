import dotenv from 'dotenv';

dotenv.config();

import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`Frero API server running on port ${PORT}`);
});
