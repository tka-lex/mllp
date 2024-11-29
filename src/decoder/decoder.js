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
Object.defineProperty(exports, "__esModule", { value: true });
const iconv = __importStar(require("iconv-lite"));
function decode(msgBuffer, hl7Encoding) {
    try {
        if (hl7Encoding.startsWith("8859/")) {
            return iconv.decode(msgBuffer, `ISO-${hl7Encoding.replace("/", "-")}`);
        }
        if (hl7Encoding.toUpperCase() === "UNICODE UTF-16") {
            return iconv.decode(msgBuffer, "UTF-16BE");
        }
        if (hl7Encoding.toUpperCase() === "ASCII") {
            return iconv.decode(msgBuffer, "ascii");
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error during decode: ", e);
    }
    return msgBuffer.toString(); // Fallback if encoding is not supported.
}
exports.default = decode;
