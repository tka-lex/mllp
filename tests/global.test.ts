import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import fs from 'fs';
import type { IncomingMessageEvent } from '../src/index.js';
import { MLLPServer } from '../src/index.js';

describe('Test server with client data exchange', () => {
  let hl7 = '';
  let server: MLLPServer;

  beforeAll(() => {
    hl7 = fs
      .readFileSync('./tests/fixtures/test.txt', 'utf-8')
      .replace(/\n/g, '\r');
    server = new MLLPServer('127.0.0.1', 1234);
  });

  describe('Sending and receiving HL7 messages', () => {
    it('receives an HL7 message', async () => {
      let error: Error | null = null;
      let data: string | null = null;

      const messagePromise = new Promise<IncomingMessageEvent>((resolve) => {
        server.on('hl7', (receivedData) => {
          resolve(receivedData);
        });
      });
      await new Promise<void>((resolve) => {
        server.send('127.0.0.1', 1234, hl7, (err, ackData) => {
          error = err;
          data = ackData;
          resolve();
        });
      });
      const receivedData = await messagePromise;

      expect(error).toBeNull();
      expect(data).toBe('MSA|AA|Q335939501T337311002');
      expect(receivedData.msg).toBe(hl7);
    });
  });

  describe('Sending HL7 message that errors', () => {
    let error: Error | null = null;
    let data: string | null = null;

    beforeEach(async () => {
      await new Promise<void>((resolve) => {
        server.send('127.0.0.1', 9999, hl7, (err, ackData) => {
          error = err;
          data = ackData;
          resolve();
        });
      });
    });

    it('receives an error response', () => {
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  });

  describe('Not passing in specific host and port', () => {
    it('should throw an Error', async () => {
      // @ts-ignore
      expect(() => new MLLPServer()).toThrowError(
        'MLLPServer host must be a string',
      );
      // @ts-ignore
      expect(() => new MLLPServer('')).toThrowError(
        'MLLPServer host must be a string',
      );
    });
    it('should throw an Error', async () => {
      // @ts-ignore
      expect(() => new MLLPServer('0.0.0.0')).toThrowError(
        'MLLPServer port must be a number > 0',
      );
      expect(() => new MLLPServer('0.0.0.0', 0)).toThrowError(
        'MLLPServer port must be a number > 0',
      );
    });
  });
});

describe('Sends a large message for data exchange', () => {
  let hl7Message = '';
  let server: MLLPServer;

  beforeAll(() => {
    hl7Message = fs
      .readFileSync('./tests/fixtures/LargeA08.txt', 'utf-8')
      .replace(/\n/g, '\r');
    server = new MLLPServer('127.0.0.1', 1235);
  });

  describe('Sending a large A08 Message and Receiving an Ack Back', () => {
    let ack: string | null = null;
    let error: Error | null = null;

    it('receives a HL7 Message', async () => {
      const messagePromise = new Promise<string>((resolve) => {
        server.on('hl7', (data) => {
          console.log('hl7', data);
          resolve(data.msg);
        });
      });
      await new Promise<void>((resolve) => {
        server.send('127.0.0.1', 1235, hl7Message, (err, ackData) => {
          error = err;
          ack = ackData;
          console.log('Sended...');
          resolve();
        });
      });
      const receivedData = await messagePromise;
      expect(receivedData).toBe(hl7Message);
      expect(ack).not.toBeNull();
      expect(error).toBeNull();
    });
  });
});
