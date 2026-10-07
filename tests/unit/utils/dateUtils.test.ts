import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDuration,
  getWeekStart,
  getWeekDays,
  hoursToDecimal,
  decimalToHoursMinutes,
  secondsToHours,
  describeFinishVsEndDate,
} from '@/utils/dateUtils';

describe('dateUtils', () => {
  describe('formatTime', () => {
    it('formats whole hours', () => {
      expect(formatTime(8)).toBe('8h');
    });

    it('formats hours with minutes', () => {
      expect(formatTime(8.5)).toBe('8h 30m');
    });

    it('formats minutes only', () => {
      expect(formatTime(0.5)).toBe('30m');
    });

    it('formats zero hours', () => {
      expect(formatTime(0)).toBe('0m');
    });

    it('handles decimal hours', () => {
      expect(formatTime(2.25)).toBe('2h 15m');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds to HH:MM:SS', () => {
      expect(formatDuration(3661)).toBe('01:01:01');
    });

    it('formats zero seconds', () => {
      expect(formatDuration(0)).toBe('00:00:00');
    });

    it('formats large durations', () => {
      expect(formatDuration(36000)).toBe('10:00:00');
    });
  });

  describe('getWeekStart', () => {
    it('returns Monday for a Wednesday', () => {
      const wednesday = new Date('2024-01-10'); // Wednesday
      const monday = getWeekStart(wednesday);
      expect(monday.getDay()).toBe(1); // Monday
      expect(monday.getDate()).toBe(8);
    });

    it('returns same day for Monday', () => {
      const monday = new Date('2024-01-08'); // Monday
      const result = getWeekStart(monday);
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(8);
    });

    it('returns previous Monday for Sunday', () => {
      const sunday = new Date('2024-01-14'); // Sunday
      const monday = getWeekStart(sunday);
      expect(monday.getDay()).toBe(1);
      expect(monday.getDate()).toBe(8);
    });
  });

  describe('getWeekDays', () => {
    it('returns 7 days starting from Monday', () => {
      const monday = new Date('2024-01-08');
      const days = getWeekDays(monday);

      expect(days).toHaveLength(7);
      expect(days[0].getDay()).toBe(1); // Monday
      expect(days[6].getDay()).toBe(0); // Sunday
    });
  });

  describe('hoursToDecimal', () => {
    it('converts hours and minutes to decimal', () => {
      expect(hoursToDecimal(2, 30)).toBe(2.5);
      expect(hoursToDecimal(1, 15)).toBe(1.25);
      expect(hoursToDecimal(0, 45)).toBe(0.75);
    });
  });

  describe('decimalToHoursMinutes', () => {
    it('converts decimal to hours and minutes', () => {
      expect(decimalToHoursMinutes(2.5)).toEqual({ hours: 2, minutes: 30 });
      expect(decimalToHoursMinutes(1.25)).toEqual({ hours: 1, minutes: 15 });
    });
  });

  describe('secondsToHours', () => {
    it('converts seconds to hours', () => {
      expect(secondsToHours(3600)).toBe(1);
      expect(secondsToHours(7200)).toBe(2);
      expect(secondsToHours(1800)).toBe(0.5);
    });
  });

  describe('describeFinishVsEndDate', () => {
    it('reports finishing on the end date', () => {
      expect(describeFinishVsEndDate('2027-03-31', '2027-03-31')).toEqual({
        text: 'on the end date',
        isLate: false,
      });
    });

    it('uses days under a week', () => {
      expect(describeFinishVsEndDate('2027-03-30', '2027-03-31')).toEqual({
        text: '1 day before the end date',
        isLate: false,
      });
      expect(describeFinishVsEndDate('2027-04-05', '2027-03-31')).toEqual({
        text: '5 days after the end date',
        isLate: true,
      });
    });

    it('uses whole weeks from a week on', () => {
      expect(describeFinishVsEndDate('2027-03-10', '2027-03-31')).toEqual({
        text: '3 weeks before the end date',
        isLate: false,
      });
      expect(describeFinishVsEndDate('2027-04-07', '2027-03-31')).toEqual({
        text: '1 week after the end date',
        isLate: true,
      });
    });

    it('counts across a clock change without drifting', () => {
      // UK clocks go forward on 28 Mar 2027
      expect(describeFinishVsEndDate('2027-04-04', '2027-03-21')?.text).toBe(
        '2 weeks after the end date'
      );
    });

    it('returns null when either date is missing or BC empty', () => {
      expect(describeFinishVsEndDate(undefined, '2027-03-31')).toBeNull();
      expect(describeFinishVsEndDate('2027-03-31', undefined)).toBeNull();
      expect(describeFinishVsEndDate('2027-03-31', '0001-01-01')).toBeNull();
      expect(describeFinishVsEndDate('not-a-date', '2027-03-31')).toBeNull();
      expect(describeFinishVsEndDate('2027-02-30', '2027-03-31')).toBeNull();
    });
  });
});
