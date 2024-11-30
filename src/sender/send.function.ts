import type { Renderable } from '../content/renderable.interface.js';
import net from 'net';
import { ASCII, MLLP_SEPARATOR } from '../ascii.js';
import type { Logger } from '../logging/logger.interface.js';
import { consoleLogger } from '../logging/logger-console.js';
import { getPayload } from '../content/payload.function.js';

export function mllpSendMessage(
  receivingHost: string,
  receivingPort: number,
  hl7Data: Buffer | Renderable | string,
  callback: (err: Error | null, response: string | null) => void,
  logger: Logger = consoleLogger,
) {
  // Render Message if it is an object:
  const log = logger;
  const payload: string | Buffer = getPayload(hl7Data);

  // Continue with Sending:
  const sendingClient = net.connect(
    {
      host: receivingHost,
      port: receivingPort,
    },
    () => {
      log(`Sending data to ${receivingHost}:${receivingPort}`);
      sendingClient.write(ASCII.VT, () => {
        sendingClient.write(payload, () => {
          sendingClient.write(MLLP_SEPARATOR);
        });
      });
    },
  );

  const terminate = () => {
    log(`closing connection with ${receivingHost}:${receivingPort}`);
    sendingClient.end();
  };

  sendingClient.on('data', (rawAckData) => {
    log(`${receivingHost}:${receivingPort} ACKED data`);

    const ackData = rawAckData
      .toString() // Buffer -> String
      .replace(ASCII.VT, '')
      .split('\r')[1] // Ack data
      .replace(ASCII.FS, '')
      .replace(ASCII.CR, '');

    callback(null, ackData);
    terminate();
  });

  sendingClient.on('error', (error) => {
    log(`${receivingHost}:${receivingPort} couldn't process data`);

    callback(error, null);
    terminate();
  });
}
