import { describe, it, expect } from 'vitest';
import { isBindRoutable, isPrivateAddress } from '../src/util/bind.js';

describe('bind routability', () => {
  it('loopback is private', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isBindRoutable('127.0.0.1')).toBe(false);
  });
  it('rfc1918 is private', () => {
    expect(isBindRoutable('10.0.0.5')).toBe(false);
    expect(isBindRoutable('192.168.1.1')).toBe(false);
    expect(isBindRoutable('172.20.0.1')).toBe(false);
  });
  it('public ipv4 is routable', () => {
    expect(isBindRoutable('8.8.8.8')).toBe(true);
  });
  it('0.0.0.0 binds anywhere so is treated as routable', () => {
    expect(isBindRoutable('0.0.0.0')).toBe(true);
  });
});
