"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MLLPServer = exports.mllpSendMessage = void 0;
const net_1 = __importDefault(require("net"));
const events_1 = __importDefault(require("events"));
const decoder_1 = __importDefault(require("./decoder"));
// @ts-ignore
const hl7 = __importStar(require("hl7"));
//The header is a vertical tab character <VT> its hex value is 0x0b.
//The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)
var VT = String.fromCharCode(0x0b);
var VTi = 0x0b;
var FS = String.fromCharCode(0x1c);
var FSi = 0x1c;
var CR = String.fromCharCode(0x0d);
var CRi = 0x0d;
function isARenderable(obj) {
    return obj.hasOwnProperty("render") && typeof obj.render === 'function';
}
function getPayload(hl7Data) {
    if (typeof hl7Data === "object" && isARenderable(hl7Data)) {
        return hl7Data.render();
    }
    else if (typeof hl7Data === "object" && !(hl7Data instanceof Buffer)) {
        return hl7Data = hl7.serializeJSON(hl7Data);
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
    var sendingClient = net_1.default.connect({
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
    var _terminate = function () {
        log('closing connection with ' + receivingHost + ':' + receivingPort);
        sendingClient.end();
    };
    sendingClient.on('data', function (rawAckData) {
        log(receivingHost + ':' + receivingPort + ' ACKED data');
        var ackData = rawAckData
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
 * var server = new MLLPServer('hl7server.mydomain', 3333, console.log);
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
            const self = this;
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
                    let data2 = hl7.parseString(messageString);
                    let msg_id = data2[0][10] + "";
                    let encoding = data2[0][18] + "";
                    if (encoding !== undefined && encoding !== null) {
                        // use Default:
                        encoding = this.charset;
                    }
                    if (encoding !== 'UNICODE UTF-8') {
                        // Decoding needed:
                        messageString = (0, decoder_1.default)(messageBuffer, encoding);
                        data2 = hl7.parseString(messageString);
                        msg_id = data2[0][10] + "";
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
                        var ack = this.createResponse(event.hl7, "AR", "Message already in progress");
                        sock.write(VT + ack + FS + CR);
                    }
                };
                /*
                 * handling incoming Data. Currently only one message per Connection is supported.
                 */
                sock.on('data', (data) => {
                    this.message = Buffer.concat([this.message, data]);
                    while (this.message.indexOf(FS + CR) > -1) {
                        var subBuffer = this.message.slice(0, this.message.indexOf(FS + CR));
                        this.message = this.message.slice(this.message.indexOf(FS + CR) + 2);
                        if (subBuffer.indexOf(VTi) > -1) {
                            subBuffer = subBuffer.slice(subBuffer.indexOf(VTi) + 1);
                        }
                        handleIncomingMessage(subBuffer);
                    }
                    if (this.message.indexOf(VTi) > 0) {
                        // got a new Message indicator - but there is something before that message- handle as (not proper closed) message:
                        var unwrappedBuffer = this.message.slice(0, this.message.indexOf(VTi));
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
        const header = [data[0]];
        //switch around sender/receiver names
        const app = data[0][3];
        const fac = data[0][4];
        header[0][3] = data[0][5];
        header[0][4] = data[0][6];
        header[0][5] = app;
        header[0][6] = fac;
        const now = new Date();
        const dt = now.getFullYear() + "" +
            ("0" + (now.getMonth() + 1)).slice(-2) + "" +
            ("0" + now.getDate()).slice(-2) + "" +
            ("0" + now.getHours()).slice(-2) + "" +
            ("0" + now.getMinutes()).slice(-2) + "" +
            ("0" + now.getSeconds()).slice(-2);
        const msgid = (dt + Math.random()).substring(0, 22);
        header[0][7] = dt;
        header[0][9] = "ACK";
        header[0][10] = msgid;
        return hl7.serializeJSON(header);
    }
    createResponse(data, ack_type, error_msg) {
        //get message ID
        const msg_id = data[0][10]; // or 10?
        return MLLPServer.createResponseHeader(data) + "\r" + "MSA|" + ack_type + "|" + msg_id + (error_msg && error_msg.length > 0 ? "|" + error_msg : "");
    }
    ;
    handleAck(event, mode) {
        if (event && event.id && event.ack) {
            if (this.OPENSOCKS[event.id] !== undefined) {
                var inMsg = this.OPENSOCKS[event.id];
                delete this.OPENSOCKS[event.id];
                // prevent Timeout:
                if (this.TIMEOUTS[event.id] !== undefined) {
                    clearTimeout(this.TIMEOUTS[event.id]);
                    delete this.TIMEOUTS[event.id];
                }
                if (event.hl7 === undefined) {
                    event.hl7 = hl7.parseString(inMsg.org);
                }
                try {
                    var ack;
                    if ((typeof event.ack) === "object" && (typeof event.ack.render) === "function") {
                        ack = event.ack.render();
                    }
                    else if ((typeof event.ack) === "object") {
                        ack = hl7.serializeJSON(event.ack);
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
