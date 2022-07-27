const iconv = require('iconv-lite')

export default function (msgBuffer: Buffer, hl7Encoding: string) {
    try {
        if (hl7Encoding.startsWith("8859/")) {
            return iconv.decode(msgBuffer, "ISO-" + hl7Encoding.replace("/","-"));
        } else if (hl7Encoding.toUpperCase() === 'UNICODE UTF-16') {
            return iconv.decode(msgBuffer, 'UTF-16BE');
        } else if (hl7Encoding.toUpperCase() === 'ASCII') {
            return iconv.decode(msgBuffer, 'ascii');
        }
    } catch (e) {
        console.error("Error during decode: " , e);
    }
    return msgBuffer.toString(); // Fallback if encoding is not supported.
};
