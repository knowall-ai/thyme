import { describe, it, expect } from 'vitest';
import { getCustomerKey, getCustomerLabel, uniqueCustomerOptions } from '@/utils/customerKey';

describe('customer key', () => {
  it('treats the same customer number under different names as one customer', () => {
    const projects = [
      { customerNo: 'C00280', customerName: 'Contoso Ltd' },
      { customerNo: 'C00280', customerName: 'Contoso Limited' },
    ];
    expect(getCustomerKey(projects[0])).toBe(getCustomerKey(projects[1]));
    // One dropdown entry, labelled with the first name seen
    expect(uniqueCustomerOptions(projects)).toEqual([{ key: 'no:C00280', name: 'Contoso Ltd' }]);
  });

  it('keeps different customer numbers with the same name apart', () => {
    const projects = [
      { customerNo: 'C00001', customerName: 'Fabrikam' },
      { customerNo: 'C00002', customerName: 'Fabrikam' },
    ];
    expect(getCustomerKey(projects[0])).not.toBe(getCustomerKey(projects[1]));
    // Same name, so the labels add the number to tell them apart
    expect(uniqueCustomerOptions(projects)).toEqual([
      { key: 'no:C00001', name: 'Fabrikam (C00001)' },
      { key: 'no:C00002', name: 'Fabrikam (C00002)' },
    ]);
  });

  it('falls back to the name, then No Customer, when there is no number', () => {
    expect(getCustomerKey({ customerName: ' Cronus ' })).toBe('name:cronus');
    expect(getCustomerKey({})).toBe('none');
    expect(getCustomerLabel({ customerNo: 'C00003' })).toBe('C00003');
    expect(getCustomerLabel({})).toBe('No Customer');
  });

  it('never confuses a number with a name', () => {
    expect(getCustomerKey({ customerNo: '123456' })).not.toBe(
      getCustomerKey({ customerName: '123456' })
    );
  });
});
