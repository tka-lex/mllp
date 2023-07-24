import net from 'net'
import EventEmitter from "events"
import decoder from './decoder'
import {Message} from "sb-sl7/dist/message";

//The header is a vertical tab character <VT> its hex value is 0x0b.
//The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)

const VT = String.fromCharCode(0x0b); const VTi = 0x0b;
const FS = String.fromCharCode(0x1c); // const FSi = 0x1c;
const CR = String.fromCharCode(0x0d); // const CRi = 0x0d;

export interface Renderable {
    render(): string|Buffer
}

function isARenderable (obj: any) : obj is Renderable {
    return obj.hasOwnProperty("render") && typeof obj.render === 'function'
}

function getPayload(hl7Data:Buffer|Renderable|string) : string|Buffer {
    if (typeof hl7Data === "object" && isARenderable(hl7Data)) {
        return  hl7Data.render();
    } else {
        return hl7Data
    }
}

export function mllpSendMessage (
    receivingHost: string, receivingPort: number,
    hl7Data:Buffer|Renderable|string,
    callback: (err: Error|null, response: string|null) => void,
    logger?: (msg:string) => void) {
    // Render Message if it is an object:
    const log = logger || console.log;
    const payload: string|Buffer = getPayload(hl7Data);


    // Continue with Sending:
    const sendingClient = net.connect({
        host: receivingHost,
        port: receivingPort
    }, function () {
        log('Sending data to ' + receivingHost + ':' + receivingPort);
        sendingClient.write(VT, function () {
            sendingClient.write(payload, function () {
                sendingClient.write(FS + CR);
            });
        });
    });

    const _terminate = function () {
        log('closing connection with ' + receivingHost + ':' + receivingPort);
        sendingClient.end();
    };

    sendingClient.on('data', function (rawAckData) {
        log(receivingHost + ':' + receivingPort + ' ACKED data');

        const ackData = rawAckData
            .toString() // Buffer -> String
            .replace(VT, '')
            .split('\r')[1] // Ack data
            .replace(FS, '')
            .replace(CR, '');

        callback(null, ackData);
        _terminate();
    });

    sendingClient.on('error', function (error) {
        log(receivingHost + ':' + receivingPort + ' couldn\'t process data');

        callback(error, null);
        _terminate();
    });
}

export interface IncomingMessageEvent {
    msg: string
    id: string
    ack: string
    hl7: any
    buffer: Buffer
}

export interface MLLPConnectionState {
    host: string
    port: number
    connected: boolean,
    remote: null|string
}

// noinspection JSUnusedGlobalSymbols
/**
 * @constructor MLLPServer
 * @param {string} host a resolvable hostname or IP Address
 * @param {integer} port a valid free port for the server to listen on.
 * @param defaultLogger
 * @param {integer} timeout after which the answer is sended.
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
export class MLLPServer extends EventEmitter {
    protected readonly HOST: string
    protected readonly PORT: number
    protected readonly TIMEOUT: number
    protected message: Buffer
    protected logger: (msg: string, ...data:any[]) => void
    protected charset: string
    private readonly TIMEOUTS: any
    private readonly OPENSOCKS: any;
    protected Server: net.Server
    protected connectionEventState: MLLPConnectionState;
    private readonly openConnections: net.Socket[] = [];
    constructor(host:string, port:number, defaultLogger?: (msg: string) => void, timeout?:number, defaultCharset?: string) {
        super()
        this.HOST = host || '127.0.0.1'
        this.PORT = port || 6969
        this.message = Buffer.from('', 'binary');
        this.TIMEOUT = timeout || 600;
        this.logger = defaultLogger || console.log;
        this.TIMEOUTS = {};
        this.OPENSOCKS = {};
        this.charset = defaultCharset !== undefined ? defaultCharset + "" : "UNICODE UTF-8";
        this.connectionEventState = {
            host: this.HOST,
            port: this.PORT,
            connected: false,
            remote: null
        }




        try {
            this.Server = net.createServer((sock) => {

                this.logger('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
                this.addSocket(sock);

                sock.on('end', () => {
                    // This should not happen, but if it does, tell everyone who is interested
                    this.emit("hl7-closed", this.updateState());
                    this.logger('server disconnected', this.HOST, this.PORT);
                    this.removeSocket(sock);
                });

                const handleIncomingMessage = (messageBuffer:Buffer) => {
                    let messageString = messageBuffer.toString();
                    let data2 = new Message(messageString);
                    let msg_id : string = data2.getString("MSH-10");
                    let encoding = data2.getString("MSH-18")
                    if (encoding === undefined || encoding === null || encoding === '') {
                        // use Default:
                        encoding = this.charset;
                    }

                    if (encoding !== 'UNICODE UTF-8') {
                        // Decoding needed:
                        messageString = decoder(messageBuffer, encoding);
                        data2 = new Message(messageString);
                        msg_id = data2.getString("MSH-10");
                    }
                    this.logger("Message:\r\n" + messageString.replace(/\r/g, "\n") + "\r\n\r\n");

                    const event : IncomingMessageEvent = {
                        id: msg_id,
                        ack: "AA",
                        msg: messageString,
                        hl7: data2,
                        buffer: messageBuffer
                    };

                    if (this.OPENSOCKS[msg_id] === undefined) {
                        // Using a Timeout if no response has been sended within the timeout.
                        this.TIMEOUTS[msg_id] = setTimeout(() => {
                            this.handleAck(event, "timeout");
                        }, this.TIMEOUT);

                        this.OPENSOCKS[msg_id] = {sock: sock, org: this.message}; // save socket and Message for Response

                        /**
                         * MLLP HL7 Event. Fired when a HL7 Message is received.
                         * @event MLLPServer#hl7
                         * @type {string}
                         * @property {object} Event with the message string (msg), the Msg-ID, the default ACK and the parsed HL7 Object
                         */
                        this.emit('hl7', event);
                    } else {
                        // The Message ID is currently already in Progress... send a direkt REJECT-Message
                        const ack = this.createResponse(event.hl7, "AR", "Message already in progress");
                        sock.write(VT + ack + FS + CR);
                    }
                };

                /*
                 * handling incoming Data. Currently only one message per Connection is supported.
                 */
                sock.on('data', (data) => {
                    this.message = Buffer.concat([this.message, data]);

                    while (this.message.indexOf(FS + CR) > -1) {
                        let subBuffer = this.message.slice(0, this.message.indexOf(FS + CR));
                        this.message = this.message.slice(this.message.indexOf(FS + CR) + 2);
                        if (subBuffer.indexOf(VTi) > -1) {
                            subBuffer = subBuffer.slice(subBuffer.indexOf(VTi) + 1);
                        }
                        handleIncomingMessage(subBuffer);
                    }

                    if (this.message.indexOf(VTi) > 0) {
                        // got a new Message indicator - but there is something before that message - handle as (not proper closed) message:
                        const unwrappedBuffer = this.message.slice(0, this.message.indexOf(VTi));
                        this.message = this.message.slice(this.message.indexOf(VTi) + 1);
                        handleIncomingMessage(unwrappedBuffer);
                    }

                });

                // emit incoming errors on the Sock to the outside world
                sock.on("error", (err) => {
                    this.emit("hl7-error", err);
                });

                sock.on('close', () => {
                    this.logger('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
                    // Tell the outside world out connection state:
                    this.removeSocket(sock);
                    this.emit("hl7-disconnected", this.updateState());
                });

            });

            if (this.HOST !== '0.0.0.0') {
                this.Server.listen(this.PORT, this.HOST, () => {
                    this.logger("Listen now to " + this.HOST + ":" + this.PORT);
                    setImmediate(() => {
                        this.emit("hl7-ready", this.updateState());
                    });
                });
            } else {
                this.Server.listen(this.PORT, () => {
                    this.logger("Listen now to [any]:" + this.PORT);
                    setImmediate(() => {
                        this.emit("hl7-ready", this.updateState());
                    });
                });
            }

            this.Server.on("close", () => {
                this.emit("hl7-closed", { port: this.PORT, host: this.HOST })
            })

            this.Server.on('error', err => {
                this.logger(`Error during MLLP Connection`, err)
            })
        } catch (e) {
            this.logger(`Error Listen to ${this.HOST}:${this.PORT}`, e)
            throw new Error(`Error Listen to ${this.HOST}:${this.PORT}`)
        }
    }

    private updateState():any {
        this.connectionEventState.connected = this.openConnections.length>0;
        let info = "";
        for (const openConnection of this.openConnections) {
            info = `${info}${info.length>0?", ": ""}${openConnection.remoteAddress}:${openConnection.remotePort}`;
        }
        this.connectionEventState.remote = info;
        return this.connectionEventState;
    };

    private addSocket(sock: net.Socket): void {
        this.openConnections.push(sock);
        this.emit("hl7-connected", this.updateState());
    };

    private  removeSocket(sock: net.Socket): void {
        const idx = this.openConnections.indexOf(sock);
        if (idx >= 0) {
            this.openConnections.splice(idx, 1);
            this.emit("hl7-state", this.updateState());
        }
    };




    public port() : number {
        return this.PORT
    }

    public isConnected() : boolean {
        return this.connectionEventState.connected
    }

    public currentRemote(): string|null {
        return this.connectionEventState.remote
    }

    public static createResponseHeader (data:Message | string | Object) : string {
        return Message.createResponse(data).render()
    }

    public createResponse(data: Message | string | Object, ack_type: string, error_msg?: string) : string {
        return Message.createResponse(data,ack_type, error_msg).render()
    }

    public handleAck (event: any, mode: any) : void {
        if (event && event.id && event.ack) {
            if (this.OPENSOCKS[event.id]!==undefined) {
                const inMsg = this.OPENSOCKS[event.id];
                delete this.OPENSOCKS[event.id];

                // prevent Timeout:
                if (this.TIMEOUTS[event.id]!==undefined) {
                    clearTimeout(this.TIMEOUTS[event.id]);
                    delete this.TIMEOUTS[event.id];
                }

                if (event.hl7===undefined) {
                    event.hl7 = new Message(inMsg.org);
                }

                try {
                    let ack;
                    if ((typeof event.ack) === "object" && (typeof event.ack.render)==="function") {
                        ack = event.ack.render();
                    } else if ((typeof  event.ack) === "string" && event.ack.length === 2 && event.hl7) {
                        ack = this.createResponse(event.hl7, event.ack);
                    } else if ((typeof  event.ack) === "string") {
                        ack = event.ack;
                    } else {
                        ack = this.createResponse(event.hl7, "AA");
                    }
                    inMsg.sock.write(VT + ack + FS + CR);
                } catch (e) {
                    this.logger("Error sending response in mode " + mode, e);
                }
            } else {
                this.logger("Reponse already send! Cannot process another response in mode " + mode ,event);
            }
        } else {
            this.logger("Response without Message ID?", event);
        }
    };



    public response(event: any) {
        this.handleAck(event, "direct");
    };

    public sendResponse (msgId: string, ack: string) {
        this.response({id: msgId, ack:ack});
    };

    public send (receivingHost: string, receivingPort: number,
                 hl7Data:Buffer|Renderable|string,
                 callback: (err: Error|null, response: string|null) => void
    ) {
        mllpSendMessage(receivingHost, receivingPort, hl7Data, callback, this.logger);
    }

    public close (done?: (err?: Error) => void) {
        // Do not accept new Connections:
        this.Server.close(done);
        // close all open Connections:
        this.openConnections.forEach(MLLPServer.closeSocket)
        this.openConnections.length = 0;
    }

    private static closeSocket(socket:net.Socket): void {
        let timeout: NodeJS.Timeout|undefined = setTimeout(() => {
            socket.destroy();
            timeout = undefined;
        }, 2000)
        socket.end(() => {
            // Ended
            if (timeout !== undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        });
    }

}
