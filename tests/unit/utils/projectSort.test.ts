import { describe, it, expect } from 'vitest';
import { compareProjectsByName } from '@/utils/projectSort';

const p = (code: string, name: string) => ({ code, name });

describe('compareProjectsByName', () => {
  it('orders by name, not by project number', () => {
    const sorted = [
      p('PR00010', 'Website'),
      p('PR00020', 'Agent Skills'),
      p('PR00005', 'Mobile app'),
    ]
      .sort(compareProjectsByName)
      .map((x) => x.name);
    expect(sorted).toEqual(['Agent Skills', 'Mobile app', 'Website']);
  });

  it('ignores case and puts numbers in natural order', () => {
    const sorted = [p('A', 'phase 10'), p('B', 'Phase 2'), p('C', 'alpha')]
      .sort(compareProjectsByName)
      .map((x) => x.name);
    expect(sorted).toEqual(['alpha', 'Phase 2', 'phase 10']);
  });

  it('falls back to the project number when names match', () => {
    const sorted = [p('PR00020', 'Support'), p('PR00010', 'Support')]
      .sort(compareProjectsByName)
      .map((x) => x.code);
    expect(sorted).toEqual(['PR00010', 'PR00020']);
  });
});
