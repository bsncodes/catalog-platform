import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, decideNotificationCallback, InvalidTransitionError } from '../src/enquiries/lifecycle.js';

describe('enquiry lifecycle', () => {
  it('allows only RECEIVED -> PROCESSED -> RESOLVED', () => {
    expect(canTransition('RECEIVED', 'PROCESSED')).toBe(true);
    expect(canTransition('PROCESSED', 'RESOLVED')).toBe(true);
    expect(canTransition('RECEIVED', 'RESOLVED')).toBe(false);
    expect(canTransition('RESOLVED', 'PROCESSED')).toBe(false);
    expect(canTransition('PROCESSED', 'RECEIVED')).toBe(false);
    expect(() => assertTransition('RESOLVED', 'PROCESSED')).toThrow(InvalidTransitionError);
  });

  it('never lets a notification callback regress RESOLVED', () => {
    expect(decideNotificationCallback('RECEIVED')).toEqual({ action: 'APPLY' });
    expect(decideNotificationCallback('PROCESSED')).toEqual({ action: 'ALREADY_PROCESSED' });
    expect(decideNotificationCallback('RESOLVED')).toEqual({ action: 'STALE_IGNORED' });
  });
});
