import app from './app';
import logger from './lib/logger';

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});
