import type net from 'net';

export interface OpenSocket {
  sock: net.Socket;
  org: Buffer;
}
