/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import net from "net";
export interface OpenSocket {
    sock: net.Socket;
    org: Buffer;
}
