'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="text-dark-200 mb-1 block text-sm font-medium">
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          ref={ref}
          className={cn(
            'border-dark-600 bg-dark-800 flex h-10 w-full rounded-lg border px-3 py-2 text-sm text-white',
            'placeholder:text-dark-400',
            'focus:ring-knowall-green focus:border-transparent focus:ring-2 focus:outline-none',
            'disabled:bg-dark-900 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
