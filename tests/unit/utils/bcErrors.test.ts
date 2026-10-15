import { describe, it, expect } from 'vitest';
import { explainBcError } from '@/utils/bcErrors';

describe('explainBcError', () => {
  it("explains Business Central's timeout in plain words, as worth retrying", () => {
    const error = new Error(
      'BC API Error (504): {"error": {"code": "Timeout","message": "Request timed out."}}'
    );
    expect(explainBcError(error)).toEqual({
      message: 'Business Central took too long to answer. This usually clears in a moment.',
      retryable: true,
    });
  });

  it('tells busy, throttled, refused, missing and unreachable apart', () => {
    expect(explainBcError(new Error('BC API Error (503): x')).message).toMatch(/busy/);
    expect(explainBcError(new Error('BC API Error (429): x')).message).toMatch(/too many/);
    expect(explainBcError(new Error('BC API Error (403): x'))).toMatchObject({
      message: expect.stringMatching(/sign-in/),
      retryable: false,
    });
    expect(explainBcError(new Error('BC API Error (404): x')).retryable).toBe(false);
    expect(explainBcError(new TypeError('Failed to fetch')).message).toMatch(/couldn't reach/);
    expect(explainBcError('anything else').message).toMatch(/Something went wrong/);
  });
});
