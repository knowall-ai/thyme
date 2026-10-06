import { describe, it, expect } from 'vitest';
import { getResourceDisplayName, getResourceInitial } from '@/utils/resourceUtils';

describe('getResourceDisplayName', () => {
  it('prefers the BC name field', () => {
    expect(
      getResourceDisplayName({ name: 'Ben Weeks', displayName: 'B. Weeks', number: 'BW' })
    ).toBe('Ben Weeks');
  });

  it('falls back to displayName when name is empty', () => {
    expect(getResourceDisplayName({ name: '', displayName: 'B. Weeks', number: 'BW' })).toBe(
      'B. Weeks'
    );
  });

  it('falls back to the resource number when no name is available', () => {
    expect(getResourceDisplayName({ name: '', number: 'BW' })).toBe('BW');
  });
});

describe('getResourceInitial', () => {
  it('returns the first character of the label', () => {
    expect(getResourceInitial({ name: 'Ben Weeks', number: 'BW' })).toBe('B');
  });

  it('uses the number when there is no name', () => {
    expect(getResourceInitial({ name: '', number: 'R0001' })).toBe('R');
  });

  it('returns ? when every label field is empty', () => {
    expect(getResourceInitial({ name: '', number: '' })).toBe('?');
  });
});
