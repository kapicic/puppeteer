/**
 * @license
 * Copyright 2026 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, beforeEach, describe, it} from 'node:test';

import expect from 'expect';

import type {ConnectionTransport} from '../common/ConnectionTransport.js';

import {Connection} from './Connection.js';

class TestConnectionTransport implements ConnectionTransport {
  sent: Array<{id: number; method: string; params: unknown}> = [];
  onmessage?: (message: string) => void;
  onclose?: () => void;

  send(message: string): void {
    this.sent.push(JSON.parse(message));
  }

  close(): void {}

  receive(message: object): void {
    this.onmessage?.(JSON.stringify(message));
  }

  attach(id: number, targetId: string, sessionId: string): void {
    this.receive({
      method: 'Target.attachedToTarget',
      params: {
        sessionId,
        targetInfo: {targetId, type: 'page'},
        waitingForDebugger: false,
      },
    });
    this.receive({id, result: {sessionId}});
  }
}

describe('Connection', () => {
  let transport: TestConnectionTransport;
  let connection: Connection;

  beforeEach(() => {
    transport = new TestConnectionTransport();
    connection = new Connection(
      '',
      transport,
      0,
      undefined,
      false,
      undefined,
      () => {
        return undefined;
      },
    );
  });

  afterEach(() => {
    connection.dispose();
  });

  describe('_createSession', () => {
    it('should unmark the target when a manual attach is rejected', async () => {
      const attach = connection._createSession({targetId: 'target'}, false);
      expect(connection.isAutoAttached('target')).toBe(false);

      transport.receive({
        id: transport.sent[0]!.id,
        error: {code: -32602, message: 'No target with given id found'},
      });
      await expect(attach).rejects.toThrow('No target with given id found');

      expect(connection.isAutoAttached('target')).toBe(true);
    });

    it('should keep the target marked while a manual attach is pending', async () => {
      const manual = connection._createSession({targetId: 'target'}, false);
      const emulated = connection._createSession({targetId: 'target'}, true);
      const [manualRequest, emulatedRequest] = transport.sent;

      transport.attach(emulatedRequest!.id, 'target', 'emulated-session');
      await emulated;
      expect(connection.isAutoAttached('target')).toBe(false);

      transport.attach(manualRequest!.id, 'target', 'manual-session');
      await manual;
      expect(connection.isAutoAttached('target')).toBe(true);
    });
  });
});
