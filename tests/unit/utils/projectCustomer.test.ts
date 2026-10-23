import { describe, it, expect } from 'vitest';
import { getProjectCustomer, getProjectCustomerName } from '@/utils/projectCustomer';

describe('getProjectCustomer', () => {
  it('is the Sell-to customer when the project has one', () => {
    const partnerWork = {
      sellToCustomerNo: 'C20000',
      sellToCustomerName: 'Fabrikam, Inc.',
      billToCustomerNo: 'C40000',
      billToCustomerName: 'Northwind Partners',
    };
    expect(getProjectCustomer(partnerWork)).toEqual({ number: 'C20000', name: 'Fabrikam, Inc.' });
    expect(getProjectCustomerName(partnerWork)).toBe('Fabrikam, Inc.');
  });

  it("uses the Bill-to name when Sell-to is the same customer (BC's copied name goes stale)", () => {
    const sameCustomer = {
      sellToCustomerNo: 'C30000',
      sellToCustomerName: 'Adatum - Old Name',
      billToCustomerNo: 'C30000',
      billToCustomerName: 'Adatum Corporation',
    };
    expect(getProjectCustomer(sameCustomer)).toEqual({
      number: 'C30000',
      name: 'Adatum Corporation',
    });
    expect(getProjectCustomer({ ...sameCustomer, billToCustomerName: '' }).name).toBe(
      'Adatum - Old Name'
    );
  });

  it('falls back to the Bill-to customer without a Sell-to (older projects or extension)', () => {
    const direct = { billToCustomerNo: 'C10000', billToCustomerName: 'Contoso Ltd.' };
    expect(getProjectCustomer(direct)).toEqual({ number: 'C10000', name: 'Contoso Ltd.' });
    expect(
      getProjectCustomer({ ...direct, sellToCustomerNo: '  ', sellToCustomerName: '' })
    ).toEqual({ number: 'C10000', name: 'Contoso Ltd.' });
  });

  it("uses the customer's number when BC has no name for it", () => {
    expect(getProjectCustomer({ sellToCustomerNo: 'C20000', billToCustomerNo: 'C40000' })).toEqual({
      number: 'C20000',
      name: 'C20000',
    });
    expect(getProjectCustomer({ billToCustomerNo: 'C10000', billToCustomerName: ' ' }).name).toBe(
      'C10000'
    );
  });

  it('is empty for a project with no customer', () => {
    expect(getProjectCustomer({})).toEqual({ number: '', name: '' });
    expect(getProjectCustomerName({ billToCustomerNo: '' })).toBe('');
  });
});
