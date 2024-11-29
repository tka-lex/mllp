import net from "net";
import EventEmitter from "events";
import { Message } from "@sourceblock-ug/sb-sl7";
import decoder from "./decoder/decoder";
import { IncomingMessageEvent } from "./interfaces/IncomingMessageEvent";
import { MLLPConnectionState } from "./interfaces/MLLPConnectionState";
import { MessageResponseEvent } from "./interfaces/MessageResponseEvent";
import { Renderable } from "./interfaces/Renderable";
import { OpenSocket } from "./interfaces/OpenSocket";

// The header is a vertical tab character <VT> its hex value is 0x0b.
// The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)

const VT = String.fromCharCode(0x0b);
const VTi = 0x0b;
const FS = String.fromCharCode(0x1c); // const FSi = 0x1c;
const CR = String.fromCharCode(0x0d); // const CRi = 0x0d;

function consoleLogger(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function isARenderable(obj: any): obj is Renderable {
  return (
    typeof obj === "object" &&
    Object.prototype.hasOwnProperty.call(obj, "render") &&
    typeof obj.render === "function"
  );
}

function getPayload(hl7Data: Buffer | Renderable | string): string | Buffer {
  if (typeof hl7Data === "object" && isARenderable(hl7Data)) {
    return hl7Data.render();
  }
  return hl7Data;
}

export function mllpSendMessage(
  receivingHost: string,
  receivingPort: number,
  hl7Data: Buffer | Renderable | string,
  callback: (err: Error | null, response: string | null) => void,
  logger: (msg: string) => void = consoleLogger
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
      sendingClient.write(VT, () => {
        sendingClient.write(payload, () => {
          sendingClient.write(FS + CR);
        });
      });
    }
  );

  const terminate = () => {
    log(`closing connection with ${receivingHost}:${receivingPort}`);
    sendingClient.end();
  };

  sendingClient.on("data", (rawAckData) => {
    log(`${receivingHost}:${receivingPort} ACKED data`);

    const ackData = rawAckData
      .toString() // Buffer -> String
      .replace(VT, "")
      .split("\r")[1] // Ack data
      .replace(FS, "")
      .replace(CR, "");

    callback(null, ackData);
    terminate();
  });

  sendingClient.on("error", (error) => {
    log(`${receivingHost}:${receivingPort} couldn't process data`);

    callback(error, null);
    terminate();
  });
}

// noinspection JSUnusedGlobalSymbols
/**
 * @constructor MLLPServer
 * @param {string} bindingAdress a resolvable hostname or IP Address
 * @param {number} bindingPort a valid free port for the server to listen on.
 * @param defaultLogger
 * @param {number} timeoutInMs after which the answer is sended.
 * @param {string} defaultCharset for Message decoding
 * @param {string} timeoutAck like AA or AE - default is AA
 *
 * @fires MLLPServer#hl7
 *
 * @example
 * const server = new MLLPServer('hl7server.mydomain', 3333, console.log);
 *
 * server.on('hl7', function(message) {
 *  console.log("Message: " + message);
 *  // INSERT Unmarshalling or Processing here
 * });
 *
 * @example
 * <caption>An ACK is sent back to the server</caption>
 *  MSH|^~\&|SOMELAB|SOMELAB|SOMELAB|SOMELAB|20080511103530||ORU^R01|Q335939501T337311002|P|2.3|||
 *  MSA|AA|Q335939501T337311002
 *
 */
export class MLLPServer extends EventEmitter {
  protected readonly bindingAddress: string = "127.0.0.1";

  protected readonly bindingPort: number = 6969;

  protected readonly timeoutInMs: number = 600;

  private readonly openTimeouts: Record<string, NodeJS.Timeout> = {};

  private readonly openEvents: Record<string, OpenSocket> = {};

  private readonly openConnections: net.Socket[] = [];

  private readonly defaultAcknowledgment: string;

  protected charset: string;

  protected Server: net.Server;

  protected connectionEventState: MLLPConnectionState;

  protected logger: (msg: string, ...data: unknown[]) => void;

  constructor(
    host: string,
    port: number,
    defaultLogger: (msg: string) => void = consoleLogger,
    timeout: number = 600,
    defaultCharset: string = "UNICODE UTF-8",
    timeoutAck: string = ""
  ) {
    super();
    this.bindingAddress = host;
    this.bindingPort = port;
    this.timeoutInMs = timeout;
    this.logger = defaultLogger;
    this.openTimeouts = {};
    this.openEvents = {};
    this.defaultAcknowledgment =
      typeof timeoutAck === "string" && timeoutAck.length === 2
        ? timeoutAck.toUpperCase()
        : "AA";
    this.charset = `${defaultCharset}`;
    this.connectionEventState = {
      host: this.bindingAddress,
      port: this.bindingPort,
      connected: false,
      remote: null,
    };

    try {
      this.Server = this.createServer();

      if (this.bindingAddress !== "0.0.0.0") {
        this.Server.listen(this.bindingPort, this.bindingAddress, () => {
          this.logger(
            `Listen now to ${this.bindingAddress}:${this.bindingPort}`
          );
          setImmediate(() => {
            this.emit("hl7-ready", this.updateState());
          });
        });
      } else {
        this.Server.listen(this.bindingPort, () => {
          this.logger(`Listen now to [any]:${this.bindingPort}`);
          setImmediate(() => {
            this.emit("hl7-ready", this.updateState());
          });
        });
      }

      this.Server.on("close", () => {
        this.emit("hl7-closed", {
          port: this.bindingPort,
          host: this.bindingAddress,
        });
      });

      this.Server.on("error", (err) => {
        this.logger(`Error during MLLP Connection`, err);
      });
    } catch (err) {
      this.logger(
        `Error Listen to ${this.bindingAddress}:${this.bindingPort}`,
        err
      );
      throw new Error(
        `Error Listen to ${this.bindingAddress}:${this.bindingPort}`
      );
    }
  }

  private createServer(): net.Server {
    return net.createServer((socket) => {
      let messageBuffer: Buffer = Buffer.from("", "binary");
      this.logger(`CONNECTED: ${socket.remoteAddress}:${socket.remotePort}`);
      this.addSocket(socket);

      socket.on("end", () => {
        // This should not happen, but if it does, tell everyone who is interested
        this.handleSocketOnEnd(socket);
      });

      /*
       * handling incoming Data. Currently only one message per Connection is supported.
       */
      socket.on("data", (data: Buffer) => {
        messageBuffer = Buffer.concat([messageBuffer, data]);
        this.handleSocketOnData(socket, messageBuffer);
      });

      // emit incoming errors on the Sock to the outside world
      socket.on("error", (err: Error) => {
        this.emit("hl7-error", err);
      });

      socket.on("close", () => {
        this.handleSocketOnClose(socket);
      });
    });
  }

  private handleSocketOnClose(socket: net.Socket): void {
    this.logger(`CLOSED: ${socket.remoteAddress} ${socket.remotePort}`);
    // Tell the outside world out connection state:
    this.removeSocket(socket);
    this.emit("hl7-disconnected", this.updateState());
  }

  private handleSocketOnEnd(socket: net.Socket) {
    this.emit("hl7-closed", this.updateState());
    this.logger("server disconnected", this.bindingAddress, this.bindingPort);
    this.removeSocket(socket);
  }

  private handleSocketOnData(socket: net.Socket, _messageBuffer: Buffer): void {
    // Reassign, so we are not overriding input parameter
    let messageBuffer: Buffer = _messageBuffer;

    while (messageBuffer.indexOf(FS + CR) > -1) {
      const EOM_INDEX: number = messageBuffer.indexOf(FS + CR);
      let subBuffer = messageBuffer.subarray(0, EOM_INDEX);
      messageBuffer = messageBuffer.subarray(EOM_INDEX + 2);

      if (subBuffer.indexOf(VTi) > -1) {
        subBuffer = subBuffer.subarray(subBuffer.indexOf(VTi) + 1);
      }
      this.handleIncomingMessage(subBuffer, socket);
    }

    if (messageBuffer.indexOf(VTi) > 0) {
      // got a new Message indicator - but there is something before that message - handle as (not proper closed) message:
      const unwrappedBuffer = messageBuffer.subarray(
        0,
        messageBuffer.indexOf(VTi)
      );
      messageBuffer = messageBuffer.subarray(messageBuffer.indexOf(VTi) + 1);
      this.handleIncomingMessage(unwrappedBuffer, socket);
    }
  }

  private handleIncomingMessage(messageBuffer: Buffer, sock: net.Socket): void {
    let messageString: string = messageBuffer.toString();
    let hl7Message: Message = new Message(messageString);
    let messageId: string = hl7Message.getString("MSH-10");
    let encoding: string = hl7Message.getString("MSH-18");

    if (encoding || encoding === null) {
      // use Default:
      encoding = this.charset;
    }

    if (encoding !== "UNICODE UTF-8") {
      // Decoding needed:
      messageString = decoder(messageBuffer, encoding);
      hl7Message = new Message(messageString);
      messageId = hl7Message.getString("MSH-10");
    }
    this.logger(`Message:\r\n${messageString.replace(/\r/g, "\n")}\r\n\r\n`);

    if (messageId === "") {
      messageId = Math.random().toString(36).substring(2);
    }

    const event: IncomingMessageEvent = {
      id: messageId,
      ack: this.defaultAcknowledgment,
      msg: messageString,
      hl7: hl7Message,
      buffer: messageBuffer,
    };

    if (this.openEvents[messageId] === undefined) {
      // Using a Timeout if no response has been sent within the timeout.
      this.openTimeouts[messageId] = setTimeout(() => {
        this.handleAck(event, "timeout");
      }, this.timeoutInMs);

      this.openEvents[messageId] = { sock, org: messageBuffer }; // save socket and Message for Response

      /**
       * MLLP HL7 Event. Fired when a HL7 Message is received.
       * @event MLLPServer#hl7
       * @type {string}
       * @property {object} Event with the message string (msg), the Msg-ID, the default ACK and the parsed HL7 Object
       */
      this.emit("hl7", event);
    } else {
      // The Message ID is currently already in Progress... send a direkt REJECT-Message
      const ackMsg = Message.createResponse(
        event.hl7,
        "AR",
        "Message already in progress"
      );
      ackMsg.cleanup();
      const ack = ackMsg.render();
      sock.write(VT + ack + FS + CR);
    }
  }

  private updateState(): MLLPConnectionState {
    this.connectionEventState.connected = this.openConnections.length > 0;
    let info = "";

    for (let i = 0; i < this.openConnections.length; i += 1) {
      const openSocketConnection = this.openConnections[i];
      info = this.createInfoString(info, openSocketConnection);
    }

    this.connectionEventState.remote = info;
    return this.connectionEventState;
  }

  private createInfoString(info: string, socketConnection: net.Socket): string {
    return `${info}${info.length > 0 ? ", " : ""}${
      socketConnection.remoteAddress
    }:${socketConnection.remotePort}`;
  }

  private addSocket(sock: net.Socket): void {
    this.openConnections.push(sock);
    this.emit("hl7-connected", this.updateState());
  }

  private removeSocket(sock: net.Socket): void {
    const idx = this.openConnections.indexOf(sock);
    if (idx >= 0) {
      this.openConnections.splice(idx, 1);
      this.emit("hl7-state", this.updateState());
    }
  }

  // TODO: Are these getters?? They are not used anywhere. If these are getters, adjust name maybe?
  public port(): number {
    return this.bindingPort;
  }

  public isConnected(): boolean {
    return this.connectionEventState.connected;
  }

  public currentRemote(): string | null {
    return this.connectionEventState.remote;
  }

  public static createResponseHeader(data: Message | string | object): string {
    const message = Message.createResponse(data);
    message.cleanup();
    return message.render();
  }

  private handleAck(event: IncomingMessageEvent, mode: any): boolean {
    if (this.openEvents[event.id] !== undefined) {
      const inMsg = this.openEvents[event.id];
      delete this.openEvents[event.id];

      // prevent Timeout:
      if (this.openTimeouts[event.id] !== undefined) {
        clearTimeout(this.openTimeouts[event.id]);
        delete this.openTimeouts[event.id];
      }

      try {
        let ack;
        if (isARenderable(event.ack)) {
          ack = event.ack.render();
        } else if (
          typeof event.ack === "string" &&
          event.ack.length === 2 &&
          event.hl7
        ) {
          const ackMsg = Message.createResponse(event.hl7, event.ack);
          ackMsg.cleanup();
          ack = ackMsg.render();
        } else if (typeof event.ack === "string") {
          ack = event.ack;
        } else {
          const ackMsg = Message.createResponse(
            event.hl7,
            this.defaultAcknowledgment
          );
          ackMsg.cleanup();
          ack = ackMsg.render();
        }
        inMsg.sock.write(VT + ack + FS + CR);
        return true;
      } catch (e) {
        this.logger(`Error sending response in mode ${mode}`, e);
      }
    } else {
      this.logger(
        `Response already send! Cannot process another response in mode ${mode}`,
        event
      );
    }
    return false;
  }

  public response(event: MessageResponseEvent): boolean {
    if (this.openEvents[event.id] !== undefined) {
      const inMsg = this.openEvents[event.id];
      return this.handleAck(
        {
          hl7: new Message(inMsg.org),
          msg: inMsg.org.toString(),
          buffer: inMsg.org,
          ...event,
        },
        "direct"
      );
    }
    this.logger(
      `Response already send! Cannot process another response directly.`,
      event
    );
    return false;
  }

  public sendResponse(msgId: string, ack: string): boolean {
    return this.response({ id: msgId, ack });
  }

  public send(
    receivingHost: string,
    receivingPort: number,
    hl7Data: Buffer | Renderable | string,
    callback: (err: Error | null, response: string | null) => void
  ) {
    mllpSendMessage(
      receivingHost,
      receivingPort,
      hl7Data,
      callback,
      this.logger
    );
  }

  public close(done?: (err?: Error) => void) {
    // Do not accept new Connections:
    this.Server.close(done);
    // close all open Connections:
    this.openConnections.forEach(MLLPServer.closeSocket);
    this.openConnections.length = 0;
  }

  private static closeSocket(socket: net.Socket): void {
    let timeout: NodeJS.Timeout | undefined = setTimeout(() => {
      socket.destroy();
      timeout = undefined;
    }, 2000);
    socket.end(() => {
      // Ended
      if (timeout !== undefined) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    });
  }
}
