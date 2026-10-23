import { describe, it, expect } from 'vitest';
import {
  customerOptionValue,
  getCustomerKey,
  getCustomerLabel,
  uniqueCustomerOptions,
} from '@/utils/customerKey';

describe('customer key', () => {
  it('treats the same customer number under different names as one customer', () => {
    const projects = [
      { customerNo: 'C00280', customerName: 'Contoso Ltd' },
      { customerNo: 'C00280', customerName: 'Contoso Limited' },
    ];
    expect(getCustomerKey(projects[0])).toBe(getCustomerKey(projects[1]));
    // One dropdown entry, labelled with the first name seen
    expect(uniqueCustomerOptions(projects)).toEqual([{ key: 'C00280', name: 'Contoso Ltd' }]);
    expect(customerOptionValue(projects[0])).toBe(customerOptionValue(projects[1]));
  });

  it('keeps different customer numbers with the same name apart', () => {
    const projects = [
      { customerNo: 'C00001', customerName: 'Fabrikam' },
      { customerNo: 'C00002', customerName: 'Fabrikam' },
    ];
    expect(getCustomerKey(projects[0])).not.toBe(getCustomerKey(projects[1]));
    expect(uniqueCustomerOptions(projects)).toHaveLength(2);
    expect(customerOptionValue(projects[0])).not.toBe(customerOptionValue(projects[1]));
  });

  it('falls back to the name, then No Customer, when there is no number', () => {
    expect(getCustomerKey({ customerName: 'Cronus' })).toBe('Cronus');
    expect(getCustomerKey({})).toBe('No Customer');
    expect(getCustomerLabel({ customerNo: 'C00003' })).toBe('C00003');
    expect(customerOptionValue({ customerName: ' Cronus ' })).toBe('cronus');
    expect(customerOptionValue({})).toBe('unknown');
  });
});
