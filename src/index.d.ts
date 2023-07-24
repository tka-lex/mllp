/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import net from "net";
import EventEmitter from "events";
import { Message } from "sb-sl7/dist/message";
export interface Renderable {
    render(): string | Buffer;
}
export declare function mllpSendMessage(receivingHost: string, receivingPort: number, hl7Data: Buffer | Renderable | string, callback: (err: Error | null, response: string | null) => void, logger?: (msg: string) => void): void;
export interface MessageResponseEvent {
    id: string;
    ack: string | Renderable | unknown;
}
export interface IncomingMessageEvent extends MessageResponseEvent {
    msg: string;
    hl7: Message;
    buffer: Buffer;
}
export interface MLLPConnectionState {
    host: string;
    port: number;
    connected: boolean;
    remote: null | string;
}
/**
 * @constructor MLLPServer
 * @param {string} host a resolvable hostname or IP Address
 * @param {number} port a valid free port for the server to listen on.
 * @param defaultLogger
 * @param {number} timeout after which the answer is sended.
 * @param {string} defaultCharset for Message decoding
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
    protected readonly HOST: string;
    protected readonly PORT: number;
    protected readonly TIMEOUT: number;
    protected message: Buffer;
    protected logger: (msg: string, ...data: unknown[]) => void;
    protected charset: string;
    private readonly TIMEOUTS;
    private readonly openEvents;
    protected Server: net.Server;
    protected connectionEventState: MLLPConnectionState;
    private readonly openConnections;
    constructor(host: string, port: number, defaultLogger?: (msg: string) => void, timeout?: number, defaultCharset?: string);
    private updateState;
    private addSocket;
    private removeSocket;
    port(): number;
    isConnected(): boolean;
    currentRemote(): string | null;
    static createResponseHeader(data: Message | string | object): string;
    private handleAck;
    response(event: MessageResponseEvent): void;
    sendResponse(msgId: string, ack: string): void;
    send(receivingHost: string, receivingPort: number, hl7Data: Buffer | Renderable | string, callback: (err: Error | null, response: string | null) => void): void;
    close(done?: (err?: Error) => void): void;
    private static closeSocket;
}
