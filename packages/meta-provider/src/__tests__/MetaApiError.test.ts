import { describe, expect, it } from 'vitest';
import { metaErrorFromResponse } from '../errors/MetaApiError.js';

describe('metaErrorFromResponse', () => {
  it('preserva code, subcode, message e fbtrace_id oficiais', () => {
    const err = metaErrorFromResponse(400, {
      error: {
        message: 'Invalid parameter',
        code: 100,
        error_subcode: 2494010,
        fbtrace_id: 'Abc123',
      },
    });
    expect(err.metaErrorCode).toBe(100);
    expect(err.metaErrorSubcode).toBe(2494010);
    expect(err.fbtraceId).toBe('Abc123');
    expect(err.message).toBe('Invalid parameter');
    expect(err.raw).toBeDefined();
  });

  it('classifica 429 como RATE_LIMIT e marca como retryable', () => {
    const err = metaErrorFromResponse(429, { error: { message: 'too many' } });
    expect(err.category).toBe('RATE_LIMIT');
    expect(err.retryable).toBe(true);
  });

  it('classifica 5xx como TRANSIENT e retryable', () => {
    const err = metaErrorFromResponse(503, { error: { message: 'unavailable' } });
    expect(err.category).toBe('TRANSIENT');
    expect(err.retryable).toBe(true);
  });

  it('classifica token expirado (code 190) como AUTH e não retryable', () => {
    const err = metaErrorFromResponse(400, { error: { message: 'expired', code: 190 } });
    expect(err.category).toBe('AUTH');
    expect(err.retryable).toBe(false);
  });

  it('respeita Retry-After em ms', () => {
    const headers = new Headers({ 'retry-after': '30' });
    const err = metaErrorFromResponse(429, { error: { message: 'slow down' } }, headers);
    expect(err.retryAfterMs).toBe(30_000);
  });
});
