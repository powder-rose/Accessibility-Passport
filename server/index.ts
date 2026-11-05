import { createApplication } from './application';
import { readConfig } from './config';

const config = readConfig();
const application = await createApplication(config);
const server = application.app.listen(config.port, config.host, () => {
  const address = server.address();
  const port =
    typeof address === 'object' && address ? address.port : config.port;
  console.log('Server ready at http://' + config.host + ':' + port);
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    server.close(async () => {
      await application.close();
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  });
