import { describe, it, expect } from 'vitest';
import {
  getBillableHours,
  isBillableEntry,
  isCompanyName,
  isInternalProject,
} from '@/utils/billable';
import type { BCTimeSheetDetail, BCTimeSheetLine } from '@/types';

const customerProject = { billToCustomerNo: 'C00010', billToCustomerName: 'Contoso Ltd' };
const internalProject = { billToCustomerNo: 'C00099', billToCustomerName: 'Contoso - Internal' };

describe('isInternalProject', () => {
  it('treats a project billed to a normal customer as external', () => {
    expect(isInternalProject(customerProject)).toBe(false);
  });

  it('treats a project with no bill-to customer as internal', () => {
    expect(isInternalProject({})).toBe(true);
    expect(isInternalProject({ billToCustomerNo: '', billToCustomerName: 'Contoso Ltd' })).toBe(
      true
    );
    expect(isInternalProject({ billToCustomerNo: '   ' })).toBe(true);
  });

  it('treats a bill-to customer named "Internal" as internal, in any case', () => {
    expect(isInternalProject(internalProject)).toBe(true);
    expect(isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'INTERNAL' })).toBe(
      true
    );
    expect(
      isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'Contoso (internal)' })
    ).toBe(true);
  });

  it('only matches "internal" as a whole word', () => {
    expect(
      isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'Contoso International' })
    ).toBe(false);
    expect(
      isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'Contoso Internally Ltd' })
    ).toBe(false);
  });

  it('treats digits and underscores around "internal" as word breaks', () => {
    expect(
      isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'Contoso_Internal' })
    ).toBe(true);
    expect(isInternalProject({ billToCustomerNo: 'C1', billToCustomerName: 'Internal2' })).toBe(
      true
    );
  });
});

describe('isInternalProject - customer named after the company', () => {
  const companyNames = ['CRONUS UK Ltd.'];

  it('treats a project billed to the company itself as internal', () => {
    expect(
      isInternalProject(
        { billToCustomerNo: 'C1', billToCustomerName: 'CRONUS UK Ltd.' },
        companyNames
      )
    ).toBe(true);
  });

  it('keeps a project billed to another customer external', () => {
    expect(isInternalProject(customerProject, companyNames)).toBe(false);
  });

  it('respects the billToIsCompany flag set when projects load', () => {
    expect(isInternalProject({ ...customerProject, billToIsCompany: true })).toBe(true);
  });

  it('still treats a customer named "Internal" as internal alongside company names', () => {
    expect(isInternalProject(internalProject, companyNames)).toBe(true);
  });
});

describe('isCompanyName', () => {
  it('matches ignoring case, punctuation and extra whitespace', () => {
    expect(isCompanyName('CRONUS UK Ltd.', ['CRONUS UK Ltd.'])).toBe(true);
    expect(isCompanyName('cronus uk ltd', ['CRONUS UK Ltd.'])).toBe(true);
    expect(isCompanyName('  CRONUS   UK Ltd ', ['CRONUS UK Ltd.'])).toBe(true);
    expect(isCompanyName('CRONUS-UK Ltd', ['CRONUS - UK Ltd'])).toBe(true);
  });

  it('matches any of the company names', () => {
    expect(isCompanyName('CRONUS UK Ltd.', ['CRONUS', undefined, 'CRONUS UK Ltd.'])).toBe(true);
  });

  it("doesn't match a different or merely similar customer", () => {
    expect(isCompanyName('Contoso Ltd', ['CRONUS UK Ltd.'])).toBe(false);
    expect(isCompanyName('CRONUS UK Ltd. Holdings', ['CRONUS UK Ltd.'])).toBe(false);
  });

  it("doesn't match blank names", () => {
    expect(isCompanyName('', ['CRONUS UK Ltd.'])).toBe(false);
    expect(isCompanyName(undefined, ['CRONUS UK Ltd.'])).toBe(false);
    expect(isCompanyName('...', ['--'])).toBe(false);
    expect(isCompanyName('CRONUS UK Ltd.', [])).toBe(false);
  });
});

describe('isBillableEntry', () => {
  it('bills a chargeable line on a customer project', () => {
    expect(isBillableEntry({ chargeable: true }, customerProject)).toBe(true);
  });

  it('never bills time on an internal project, even when the line is chargeable', () => {
    expect(isBillableEntry({ chargeable: true }, internalProject)).toBe(false);
    expect(isBillableEntry({ chargeable: true }, {})).toBe(false);
  });

  it('respects a line marked not chargeable', () => {
    expect(isBillableEntry({ chargeable: false }, customerProject)).toBe(false);
  });

  it('treats a line without the chargeable field as chargeable', () => {
    expect(isBillableEntry({}, customerProject)).toBe(true);
  });

  it('judges the line alone when the project is unknown', () => {
    expect(isBillableEntry({ chargeable: true }, undefined)).toBe(true);
    expect(isBillableEntry({ chargeable: false }, null)).toBe(false);
  });
});

describe('getBillableHours', () => {
  const line = (lineNo: number, jobNo: string, extra: Partial<BCTimeSheetLine> = {}) =>
    ({
      id: `l${lineNo}`,
      timeSheetNo: 'TS1',
      lineNo,
      type: 'Job',
      jobNo,
      ...extra,
    }) as BCTimeSheetLine;
  const detail = (lineNo: number, quantity: number) =>
    ({
      id: `d${lineNo}`,
      timeSheetNo: 'TS1',
      timeSheetLineNo: lineNo,
      date: '2026-10-05',
      quantity,
    }) as BCTimeSheetDetail;
  const projects = new Map([
    ['CUST', customerProject],
    ['INT', internalProject],
  ]);

  it('counts only chargeable time on customer projects', () => {
    const lines = [
      line(1, 'CUST'),
      line(2, 'INT'),
      line(3, 'CUST', { chargeable: false }),
      line(4, 'UNKNOWN'), // project not known: judged on the line alone
      line(5, '', { type: 'Absence' }),
    ];
    const details = [detail(1, 3), detail(2, 2), detail(3, 1), detail(4, 1.5), detail(5, 8)];

    expect(getBillableHours(lines, details, projects)).toBe(4.5);
  });

  it('ignores zero quantities and details without a line', () => {
    expect(getBillableHours([line(1, 'CUST')], [detail(1, 0), detail(9, 4)], projects)).toBe(0);
  });
});
