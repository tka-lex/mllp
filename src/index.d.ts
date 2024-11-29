/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import net from "net";
import EventEmitter from "events";
import { Message } from "@sourceblock-ug/sb-sl7";
import { MLLPConnectionState } from "./interfaces/MLLPConnectionState";
import { MessageResponseEvent } from "./interfaces/MessageResponseEvent";
import { Renderable } from "./interfaces/Renderable";
export declare function mllpSendMessage(receivingHost: string, receivingPort: number, hl7Data: Buffer | Renderable | string, callback: (err: Error | null, response: string | null) => void, logger?: (msg: string) => void): void;
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
export declare class MLLPServer extends EventEmitter {
    protected readonly bindingAddress: string;
    protected readonly bindingPort: number;
    protected readonly timeoutInMs: number;
    private readonly openTimeouts;
    private readonly openEvents;
    private readonly openConnections;
    private readonly defaultAcknowledgment;
    protected charset: string;
    protected Server: net.Server;
    protected connectionEventState: MLLPConnectionState;
    protected logger: (msg: string, ...data: unknown[]) => void;
    constructor(host: string, port: number, defaultLogger?: (msg: string) => void, timeout?: number, defaultCharset?: string, timeoutAck?: string);
    private createServer;
    private handleSocketOnClose;
    private handleSocketOnEnd;
    private handleSocketOnData;
    private handleIncomingMessage;
    private updateState;
    private createInfoString;
    private addSocket;
    private removeSocket;
    port(): number;
    isConnected(): boolean;
    currentRemote(): string | null;
    static createResponseHeader(data: Message | string | object): string;
    private handleAck;
    response(event: MessageResponseEvent): boolean;
    sendResponse(msgId: string, ack: string): boolean;
    send(receivingHost: string, receivingPort: number, hl7Data: Buffer | Renderable | string, callback: (err: Error | null, response: string | null) => void): void;
    close(done?: (err?: Error) => void): void;
    private static closeSocket;
}
