var net = require('net');
var hl7 = require('hl7');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

//The header is a vertical tab character <VT> its hex value is 0x0b.
//The trailer is a field separator character <FS> (hex 0x1c) immediately followed by a carriage return <CR> (hex 0x0d)

var VT = String.fromCharCode(0x0b);
var FS = String.fromCharCode(0x1c);
var CR = String.fromCharCode(0x0d);

/**
 * @constructor MLLPServer
 * @param {string} host a resolvable hostname or IP Address
 * @param {integer} port a valid free port for the server to listen on.
 * @param {object} logger
 * @param {integer} timeout after which the answer is sended.
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
function MLLPServer(host, port, logger, timeout) {

    var self = this;
    this.message = '';
    var HOST = host || '127.0.0.1';
    var PORT = port || 6969;
    var TIMEOUT = timeout || 600;
    logger = logger || console.log;
    var TIMEOUTS = {};
    var OPENSOCKS = {};

    self.createResponseHeader = function(data) {
        var header = [data[0]];

        //switch around sender/receiver names
        header[0][3] = data[0][5];
        header[0][4] = data[0][6];
        header[0][5] = data[0][3];
        header[0][6] = data[0][4];

        return hl7.serializeJSON(header);
    };

    self.createResponse = function(data, ack_type, error_msg) {
        //get message ID
        var msg_id = data[0][10];
        return self.createResponseHeader(data)  + "\r" + "MSA|" + ack_type + "|" + msg_id + (error_msg && error_msg.length>0?"|" + error_msg:"");
    };

    var handleAck = function(event) {
        if (event && event.id && event.ack) {
            if (OPENSOCKS[event.id]!==undefined) {
                var inMsg = OPENSOCKS[event.id];
                delete OPENSOCKS[event.id];

                // prevent Timeout:
                if (TIMEOUTS[event.id]!==undefined) {
                    clearTimeout(TIMEOUTS[event.id]);
                    delete TIMEOUTS[event.id];
                }

                if (event.hl7===undefined) {
                    event.hl7 = hl7.parseString(inMsg.org);
                }

                try {
                    var ack;
                    if ((typeof event.ack) === "object" && (typeof event.ack.render)==="function") {
                        ack = event.ack.render();
                    } else if ((typeof event.ack) === "object") {
                        ack = hl7.serializeJSON(event.ack);
                    } else if ((typeof  event.ack) === "string" && event.ack.length === 2 && event.hl7) {
                        ack = self.createResponse(event.hl7, event.ack);
                    } else if ((typeof  event.ack) === "string") {
                        ack = event.ack;
                    } else {
                        ack = self.createResponse(event.hl7, "AA");
                    }
                    inMsg.sock.write(VT + ack + FS + CR);
                } catch (e) {
                    logger("Error sending response", e);
                }
            } else {
                logger("Reponse already send! Cannot process response" ,event);
            }
        } else {
            logger("Response without Message ID?", event);
        }
    };

    var connectionEventState = {
        host: HOST,
        port: PORT,
        connected: false,
        remote: null
    };
    setImmediate(function () {
        self.emit("hl7-ready", connectionEventState);
    });
    var Server = net.createServer(function (sock) {

        logger('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);

        // Tell the outside world out connection state:
        connectionEventState.connected = true;
        connectionEventState.remote = sock.remoteAddress + ":" + sock.remotePort;
        self.emit("hl7-connected", connectionEventState);

        sock.on('end', function() {
            // This should not happen, but if it does, tell everyone who is interested
            connectionEventState.connected = false;
            connectionEventState.remote = null;
            self.emit("hl7-closed", connectionEventState);
            logger('server disconnected', HOST, PORT);
        });

        /*
         * handling incoming Data. Currently only one message per Connection is supported.
         */
        sock.on('data', function (data) {
            data = data.toString();
            //strip separators
            logger("DATA:\nfrom " + sock.remoteAddress + ':\n' + data.split("\r").join("\n"));

            if (data.indexOf(VT) > -1) {
                self.message = '';
            }

            self.message += data.replace(VT, '');

            if (data.indexOf(FS + CR) > -1) {
                self.message = self.message.replace(FS + CR, '');
                var data2 = hl7.parseString(self.message);
                var msg_id = data2[0][10];
                logger("Message:\r\n" + self.message + "\r\n\r\n");

                var event = {
                    "msg" : self.message,
                    "id" : msg_id,
                    "ack" : "AA",
                    "hl7" : data2
                };

                if (OPENSOCKS[msg_id]===undefined) {
                    // Using a Timeout if no response has been sended within the timeout.
                    TIMEOUTS[msg_id] = setTimeout(function () {
                        handleAck(event);
                    }, TIMEOUT);

                    OPENSOCKS[msg_id] = {sock: sock, org: self.message}; // save socket and Message for Response

                    /**
                     * MLLP HL7 Event. Fired when a HL7 Message is received.
                     * @event MLLPServer#hl7
                     * @type {string}
                     * @property {object} Event with the message string (msg), the Msg-ID, the default ACK and the parsed HL7 Object
                     */
                    self.emit('hl7', event);
                } else {
                    // The Message ID is currently already in Progress... send a direkt REJECT-Message
                    var ack = self.createResponse(event.hl7, "AR", "Message already in progress");
                    sock.write(VT + ack + FS + CR);
                }
            }

        });

        // emit incoming errors on the Sock to the outside world
        sock.on("error", function (err) {
            self.emit("hl7-error", err);
        });

        sock.on('close', function () {
            logger('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
            // Tell the outside world out connection state:
            connectionEventState.connected = false;
            connectionEventState.remote = null;
            self.emit("hl7-disconnected", connectionEventState);
        });

    });

    self.response = function(event) {
        handleAck(event);
    };

    self.sendResponse = function(msgId, ack) {
        self.response({id: msgId, ack:ack});
    };

    self.send = function (receivingHost, receivingPort, hl7Data, callback) {
        // Render Message if it is an object:
        if (typeof hl7Data ==="object" && (typeof hl7Data.render)==="function") {
            hl7Data = hl7Data.render();
        } else if (typeof hl7Data ==="object" ) {
            hl7Data = hl7.serializeJSON(hl7Data);
        }

        // Continue with Sending:
        var sendingClient = new net.connect({
            host: receivingHost,
            port: receivingPort
        }, function () {
            logger('Sending data to ' + receivingHost + ':' + receivingPort);
            sendingClient.write(VT + hl7Data + FS + CR);
        });

        var _terminate = function () {
            logger('closing connection with ' + receivingHost + ':' + receivingPort);
            sendingClient.end();
        };

        sendingClient.on('data', function (rawAckData) {
            logger(receivingHost + ':' + receivingPort + ' ACKED data');

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
            logger(receivingHost + ':' + receivingPort + ' couldn\'t process data');

            callback(error, null);
            _terminate();
        });
    };

    self.close = function(done) {
      Server.close(done);
    };

    Server.listen(PORT, HOST);
}

util.inherits(MLLPServer, EventEmitter);

exports.MLLPServer = MLLPServer;
