import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalHook } from '../src/network.js';

test('hook local: loopback sem cabeçalho de proxy', () => {
  assert.equal(isLocalHook('127.0.0.1', {}), true);
  assert.equal(isLocalHook('::ffff:127.0.0.1', { 'content-type': 'application/json' }), true);
});

test('recusa pedido vindo pelo tailscale serve (loopback com cabeçalho de proxy)', () => {
  assert.equal(isLocalHook('127.0.0.1', { 'x-forwarded-for': '100.64.0.7' }), false);
  assert.equal(isLocalHook('127.0.0.1', { 'tailscale-user-login': 'alguem@exemplo' }), false);
});

test('recusa endereço de fora', () => {
  assert.equal(isLocalHook('192.168.100.20', {}), false);
  assert.equal(isLocalHook('100.99.10.5', {}), false);
});
