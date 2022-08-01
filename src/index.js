"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MLLPServer = exports.mllpSendMessage = void 0;
const net_1 = __importDefault(require("net"));
const events_1 = __importDefault(require("events"));
const decoder_1 = __importDefault(require("./decoder"));
const message_1 = require("sb-sl7/dist/message");
//The header is a vertical tab character <VT> its hex value is 0x0b.
//The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)
const VT = String.fromCharCode(0x0b);
const VTi = 0x0b;
const FS = String.fromCharCode(0x1c); // const FSi = 0x1c;
const CR = String.fromCharCode(0x0d); // const CRi = 0x0d;
function isARenderable(obj) {
    return obj.hasOwnProperty("render") && typeof obj.render === 'function';
}
function getPayload(hl7Data) {
    if (typeof hl7Data === "object" && isARenderable(hl7Data)) {
        return hl7Data.render();
    }
    else {
        return hl7Data;
    }
}
function mllpSendMessage(receivingHost, receivingPort, hl7Data, callback, logger) {
    // Render Message if it is an object:
    const log = logger || console.log;
    const payload = getPayload(hl7Data);
    // Continue with Sending:
    const sendingClient = net_1.default.connect({
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
exports.mllpSendMessage = mllpSendMessage;
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
class MLLPServer extends events_1.default {
    constructor(host, port, defaultLogger, timeout, defaultCharset) {
        super();
        this.HOST = host || '127.0.0.1';
        this.PORT = port || 6969;
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
        };
        try {
            setImmediate(() => {
                this.emit("hl7-ready", this.connectionEventState);
            });
            this.Server = net_1.default.createServer((sock) => {
                this.logger('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
                // Tell the outside world out connection state:
                this.connectionEventState.connected = true;
                this.connectionEventState.remote = sock.remoteAddress + ":" + sock.remotePort;
                this.emit("hl7-connected", this.connectionEventState);
                sock.on('end', () => {
                    // This should not happen, but if it does, tell everyone who is interested
                    this.connectionEventState.connected = false;
                    this.connectionEventState.remote = null;
                    this.emit("hl7-closed", this.connectionEventState);
                    this.logger('server disconnected', this.HOST, this.PORT);
                });
                const handleIncomingMessage = (messageBuffer) => {
                    let messageString = messageBuffer.toString();
                    let data2 = new message_1.Message(messageString);
                    let msg_id = data2.getString("MSH-10");
                    let encoding = data2.getString("MSH-18");
                    if (encoding === undefined || encoding === null || encoding === '') {
                        // use Default:
                        encoding = this.charset;
                    }
                    if (encoding !== 'UNICODE UTF-8') {
                        // Decoding needed:
                        messageString = (0, decoder_1.default)(messageBuffer, encoding);
                        data2 = new message_1.Message(messageString);
                        msg_id = data2.getString("MSH-10");
                    }
                    this.logger("Message:\r\n" + messageString.replace(/\r/g, "\n") + "\r\n\r\n");
                    const event = {
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
                        this.OPENSOCKS[msg_id] = { sock: sock, org: this.message }; // save socket and Message for Response
                        /**
                         * MLLP HL7 Event. Fired when a HL7 Message is received.
                         * @event MLLPServer#hl7
                         * @type {string}
                         * @property {object} Event with the message string (msg), the Msg-ID, the default ACK and the parsed HL7 Object
                         */
                        this.emit('hl7', event);
                    }
                    else {
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
                    this.connectionEventState.connected = false;
                    this.connectionEventState.remote = null;
                    this.emit("hl7-disconnected", this.connectionEventState);
                });
            });
            if (this.HOST !== '0.0.0.0') {
                this.Server.listen(this.PORT, this.HOST, () => {
                    this.logger("Listen now to " + this.HOST + ":" + this.PORT);
                });
            }
            else {
                this.Server.listen(this.PORT, () => {
                    this.logger("Listen now to [any]:" + this.PORT);
                });
            }
            this.Server.on("close", () => {
                this.emit("hl7-closed", { port: this.PORT, host: this.HOST });
            });
            this.Server.on('error', err => {
                this.logger(`Error during MLLP Connection`, err);
            });
        }
        catch (e) {
            this.logger(`Error Listen to ${this.HOST}:${this.PORT}`, e);
            throw new Error(`Error Listen to ${this.HOST}:${this.PORT}`);
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
        return message_1.Message.createResponse(data).render();
    }
    createResponse(data, ack_type, error_msg) {
        return message_1.Message.createResponse(data, ack_type, error_msg).render();
    }
    handleAck(event, mode) {
        if (event && event.id && event.ack) {
            if (this.OPENSOCKS[event.id] !== undefined) {
                const inMsg = this.OPENSOCKS[event.id];
                delete this.OPENSOCKS[event.id];
                // prevent Timeout:
                if (this.TIMEOUTS[event.id] !== undefined) {
                    clearTimeout(this.TIMEOUTS[event.id]);
                    delete this.TIMEOUTS[event.id];
                }
                if (event.hl7 === undefined) {
                    event.hl7 = new message_1.Message(inMsg.org);
                }
                try {
                    let ack;
                    if ((typeof event.ack) === "object" && (typeof event.ack.render) === "function") {
                        ack = event.ack.render();
                    }
                    else if ((typeof event.ack) === "string" && event.ack.length === 2 && event.hl7) {
                        ack = this.createResponse(event.hl7, event.ack);
                    }
                    else if ((typeof event.ack) === "string") {
                        ack = event.ack;
                    }
                    else {
                        ack = this.createResponse(event.hl7, "AA");
                    }
                    inMsg.sock.write(VT + ack + FS + CR);
                }
                catch (e) {
                    this.logger("Error sending response in mode " + mode, e);
                }
            }
            else {
                this.logger("Reponse already send! Cannot process another response in mode " + mode, event);
            }
        }
        else {
            this.logger("Response without Message ID?", event);
        }
    }
    ;
    response(event) {
        this.handleAck(event, "direct");
    }
    ;
    sendResponse(msgId, ack) {
        this.response({ id: msgId, ack: ack });
    }
    ;
    send(receivingHost, receivingPort, hl7Data, callback) {
        mllpSendMessage(receivingHost, receivingPort, hl7Data, callback, this.logger);
    }
    close(done) {
        this.Server.close(done);
    }
}
exports.MLLPServer = MLLPServer;
