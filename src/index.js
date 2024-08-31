"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MLLPServer = exports.mllpSendMessage = void 0;
const net_1 = __importDefault(require("net"));
const events_1 = __importDefault(require("events"));
const sb_sl7_1 = require("@sourceblock-ug/sb-sl7");
const decoder_1 = __importDefault(require("./decoder"));
// The header is a vertical tab character <VT> its hex value is 0x0b.
// The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)
const VT = String.fromCharCode(0x0b);
const VTi = 0x0b;
const FS = String.fromCharCode(0x1c); // const FSi = 0x1c;
const CR = String.fromCharCode(0x0d); // const CRi = 0x0d;
function isARenderable(obj) {
    return (typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(obj, "render") &&
        typeof obj.render === "function");
}
function getPayload(hl7Data) {
    if (typeof hl7Data === "object" && isARenderable(hl7Data)) {
        return hl7Data.render();
    }
    return hl7Data;
}
function mllpSendMessage(receivingHost, receivingPort, hl7Data, callback, logger) {
    // Render Message if it is an object:
    const log = logger || console.log;
    const payload = getPayload(hl7Data);
    // Continue with Sending:
    const sendingClient = net_1.default.connect({
        host: receivingHost,
        port: receivingPort,
    }, () => {
        log(`Sending data to ${receivingHost}:${receivingPort}`);
        sendingClient.write(VT, () => {
            sendingClient.write(payload, () => {
                sendingClient.write(FS + CR);
            });
        });
    });
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
exports.mllpSendMessage = mllpSendMessage;
// noinspection JSUnusedGlobalSymbols
/**
 * @constructor MLLPServer
 * @param {string} host a resolvable hostname or IP Address
 * @param {number} port a valid free port for the server to listen on.
 * @param defaultLogger
 * @param {number} timeout after which the answer is sended.
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
class MLLPServer extends events_1.default {
    constructor(host, port, defaultLogger, timeout, defaultCharset, timeoutAck) {
        super();
        this.openConnections = [];
        this.HOST = host || "127.0.0.1";
        this.PORT = port || 6969;
        this.TIMEOUT = timeout || 600;
        this.logger = defaultLogger || console.log;
        this.TIMEOUTS = {};
        this.openEvents = {};
        this.timeoutAck =
            typeof timeoutAck === "string" && timeoutAck.length === 2
                ? timeoutAck.toUpperCase()
                : "AA";
        this.charset =
            defaultCharset !== undefined ? `${defaultCharset}` : "UNICODE UTF-8";
        this.connectionEventState = {
            host: this.HOST,
            port: this.PORT,
            connected: false,
            remote: null,
        };
        try {
            this.Server = net_1.default.createServer((sock) => {
                let message = Buffer.from("", "binary");
                this.logger(`CONNECTED: ${sock.remoteAddress}:${sock.remotePort}`);
                this.addSocket(sock);
                sock.on("end", () => {
                    // This should not happen, but if it does, tell everyone who is interested
                    this.emit("hl7-closed", this.updateState());
                    this.logger("server disconnected", this.HOST, this.PORT);
                    this.removeSocket(sock);
                });
                /*
                 * handling incoming Data. Currently only one message per Connection is supported.
                 */
                sock.on("data", (data) => {
                    message = Buffer.concat([message, data]);
                    while (message.indexOf(FS + CR) > -1) {
                        let subBuffer = message.subarray(0, message.indexOf(FS + CR));
                        message = message.subarray(message.indexOf(FS + CR) + 2);
                        if (subBuffer.indexOf(VTi) > -1) {
                            subBuffer = subBuffer.subarray(subBuffer.indexOf(VTi) + 1);
                        }
                        this.handleIncomingMessage(subBuffer, sock);
                    }
                    if (message.indexOf(VTi) > 0) {
                        // got a new Message indicator - but there is something before that message - handle as (not proper closed) message:
                        const unwrappedBuffer = message.subarray(0, message.indexOf(VTi));
                        message = message.subarray(message.indexOf(VTi) + 1);
                        this.handleIncomingMessage(unwrappedBuffer, sock);
                    }
                });
                // emit incoming errors on the Sock to the outside world
                sock.on("error", (err) => {
                    this.emit("hl7-error", err);
                });
                sock.on("close", () => {
                    this.logger(`CLOSED: ${sock.remoteAddress} ${sock.remotePort}`);
                    // Tell the outside world out connection state:
                    this.removeSocket(sock);
                    this.emit("hl7-disconnected", this.updateState());
                });
            });
            if (this.HOST !== "0.0.0.0") {
                this.Server.listen(this.PORT, this.HOST, () => {
                    this.logger(`Listen now to ${this.HOST}:${this.PORT}`);
                    setImmediate(() => {
                        this.emit("hl7-ready", this.updateState());
                    });
                });
            }
            else {
                this.Server.listen(this.PORT, () => {
                    this.logger(`Listen now to [any]:${this.PORT}`);
                    setImmediate(() => {
                        this.emit("hl7-ready", this.updateState());
                    });
                });
            }
            this.Server.on("close", () => {
                this.emit("hl7-closed", { port: this.PORT, host: this.HOST });
            });
            this.Server.on("error", (err) => {
                this.logger(`Error during MLLP Connection`, err);
            });
        }
        catch (e) {
            this.logger(`Error Listen to ${this.HOST}:${this.PORT}`, e);
            throw new Error(`Error Listen to ${this.HOST}:${this.PORT}`);
        }
    }
    handleIncomingMessage(messageBuffer, sock) {
        let messageString = messageBuffer.toString();
        let data2 = new sb_sl7_1.Message(messageString);
        let msgId = data2.getString("MSH-10");
        let encoding = data2.getString("MSH-18");
        if (encoding === undefined || encoding === null || encoding === "") {
            // use Default:
            encoding = this.charset;
        }
        if (encoding !== "UNICODE UTF-8") {
            // Decoding needed:
            messageString = (0, decoder_1.default)(messageBuffer, encoding);
            data2 = new sb_sl7_1.Message(messageString);
            msgId = data2.getString("MSH-10");
        }
        this.logger(`Message:\r\n${messageString.replace(/\r/g, "\n")}\r\n\r\n`);
        if (msgId === "") {
            msgId = Math.random().toString(36).substring(2);
        }
        const event = {
            id: msgId,
            ack: this.timeoutAck,
            msg: messageString,
            hl7: data2,
            buffer: messageBuffer,
        };
        if (this.openEvents[msgId] === undefined) {
            // Using a Timeout if no response has been sended within the timeout.
            this.TIMEOUTS[msgId] = setTimeout(() => {
                this.handleAck(event, "timeout");
            }, this.TIMEOUT);
            this.openEvents[msgId] = { sock, org: messageBuffer }; // save socket and Message for Response
            /**
             * MLLP HL7 Event. Fired when a HL7 Message is received.
             * @event MLLPServer#hl7
             * @type {string}
             * @property {object} Event with the message string (msg), the Msg-ID, the default ACK and the parsed HL7 Object
             */
            this.emit("hl7", event);
        }
        else {
            // The Message ID is currently already in Progress... send a direkt REJECT-Message
            const ackMsg = sb_sl7_1.Message.createResponse(event.hl7, "AR", "Message already in progress");
            ackMsg.cleanup();
            const ack = ackMsg.render();
            sock.write(VT + ack + FS + CR);
        }
    }
    updateState() {
        this.connectionEventState.connected = this.openConnections.length > 0;
        let info = "";
        for (let i = 0; i < this.openConnections.length; i += 1) {
            const openConnection = this.openConnections[i];
            info = `${info}${info.length > 0 ? ", " : ""}${openConnection.remoteAddress}:${openConnection.remotePort}`;
        }
        this.connectionEventState.remote = info;
        return this.connectionEventState;
    }
    addSocket(sock) {
        this.openConnections.push(sock);
        this.emit("hl7-connected", this.updateState());
    }
    removeSocket(sock) {
        const idx = this.openConnections.indexOf(sock);
        if (idx >= 0) {
            this.openConnections.splice(idx, 1);
            this.emit("hl7-state", this.updateState());
        }
    }
    port() {
        return this.PORT;
    }
    isConnected() {
        return this.connectionEventState.connected;
    }
    currentRemote() {
        return this.connectionEventState.remote;
    }
    static createResponseHeader(data) {
        const message = sb_sl7_1.Message.createResponse(data);
        message.cleanup();
        return message.render();
    }
    handleAck(event, mode) {
        if (this.openEvents[event.id] !== undefined) {
            const inMsg = this.openEvents[event.id];
            delete this.openEvents[event.id];
            // prevent Timeout:
            if (this.TIMEOUTS[event.id] !== undefined) {
                clearTimeout(this.TIMEOUTS[event.id]);
                delete this.TIMEOUTS[event.id];
            }
            try {
                let ack;
                if (isARenderable(event.ack)) {
                    ack = event.ack.render();
                }
                else if (typeof event.ack === "string" &&
                    event.ack.length === 2 &&
                    event.hl7) {
                    const ackMsg = sb_sl7_1.Message.createResponse(event.hl7, event.ack);
                    ackMsg.cleanup();
                    ack = ackMsg.render();
                }
                else if (typeof event.ack === "string") {
                    ack = event.ack;
                }
                else {
                    const ackMsg = sb_sl7_1.Message.createResponse(event.hl7, this.timeoutAck);
                    ackMsg.cleanup();
                    ack = ackMsg.render();
                }
                inMsg.sock.write(VT + ack + FS + CR);
                return true;
            }
            catch (e) {
                this.logger(`Error sending response in mode ${mode}`, e);
            }
        }
        else {
            this.logger(`Response already send! Cannot process another response in mode ${mode}`, event);
        }
        return false;
    }
    response(event) {
        if (this.openEvents[event.id] !== undefined) {
            const inMsg = this.openEvents[event.id];
            return this.handleAck(Object.assign({ hl7: new sb_sl7_1.Message(inMsg.org), msg: inMsg.org.toString(), buffer: inMsg.org }, event), "direct");
        }
        this.logger(`Response already send! Cannot process another response directly.`, event);
        return false;
    }
    sendResponse(msgId, ack) {
        return this.response({ id: msgId, ack });
    }
    send(receivingHost, receivingPort, hl7Data, callback) {
        mllpSendMessage(receivingHost, receivingPort, hl7Data, callback, this.logger);
    }
    close(done) {
        // Do not accept new Connections:
        this.Server.close(done);
        // close all open Connections:
        this.openConnections.forEach(MLLPServer.closeSocket);
        this.openConnections.length = 0;
    }
    static closeSocket(socket) {
        let timeout = setTimeout(() => {
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
exports.MLLPServer = MLLPServer;
