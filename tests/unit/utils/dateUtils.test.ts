import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDuration,
  getWeekStart,
  getWeekDays,
  hoursToDecimal,
  decimalToHoursMinutes,
  secondsToHours,
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
});
