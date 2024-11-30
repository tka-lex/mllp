import { MLLPServer } from './index';

const timeout = 600; // ms
const server = new MLLPServer('127.0.0.1', 1234, console.log, timeout);

// Subscribe to inbound messages
server.on('hl7', (eventData) => {
  console.debug('received payload: ', eventData.msg);

  /*
   * You can send a Response back to the Server by using server.response(eventData).
   * Your Response can (must?) be packed into the "eventData.ack" Property.
   * Default is "AA" - other possible values see below.
   *
   * Alternatively you can use server.sendResponse(msg_id, <your-response>).
   *
   * Please be aware, that the Server will automatically send a default ACK after the given Timeout!
   * If you send a response after the Timeout, your response will be ignored but logged.
   * Attention:
   * The Timeout and the EventHandler currently share the Event-Object. Changes to eventData.ack
   * before the timeout will be used for the timeout-triggered response!
   *
   * Possible Values for a Answer are:
   * - 2 Letter HL7 State like "AA", "AE" or "AR" (see http://wiki.hl7.de/index.php?title=Segment_MSA)
   * - Object with a "render" method (Which will be called to get the String for the Message)
   * - Object stringify with the hl7 "serializeJSON" method (nodejs hl7 Package)
   * - String containing the full response
   */

  /* if (false) {
        // Direct Answer:
        eventData.ack = "AR"; // Reject the Message in this example

        server.response(eventData);
        // server.sendResponse(eventData.id, "AA"); // alternatively
        // or skip both to let the timeout handle this for you.
    } else { */
  // you can  also send the incoming message to another Server and use the Response
  eventData.ack = 'AE'; // set defaul to an Error
  server.send('127.0.0.1', 22222, eventData.hl7, (err, ackData) => {
    // async callback code here
    console.log(eventData);
    eventData.ack = `${server.createResponseHeader(eventData.hl7)}\r${ackData}`;
    server.response(eventData);
  });
  // }
});

// Send outbound messages
server.send('127.0.0.1', 22222, 'outbound-hl7-message', (err, ackData) => {
  // async callback code here
  console.log(err, ackData);
});
