import { useState, useCallback, useRef } from 'react';

// --- Validation Rule Types ---

export type ValidationRule<T = any> = {
  /** Validation function - returns error message string or null/undefined if valid */
  validate: (value: any, formData: T) => string | null | undefined;
};

export type FieldRules<T> = {
  [K in keyof T]?: ValidationRule<T>[];
};

export type FieldErrors<T> = {
  [K in keyof T]?: string;
};

export interface UseFormValidationReturn<T> {
  /** Current field errors */
  errors: FieldErrors<T>;
  /** Whether any errors exist */
  hasErrors: boolean;
  /** Validate a single field (e.g., on blur) */
  validateField: (field: keyof T, value: any) => string | null;
  /** Validate all fields - returns true if form is valid */
  validateAll: (formData: T) => boolean;
  /** Set a manual error for a field */
  setFieldError: (field: keyof T, message: string) => void;
  /** Clear error for a specific field */
  clearFieldError: (field: keyof T) => void;
  /** Clear all errors */
  clearErrors: () => void;
  /** Get input state for a field ('error' | 'success' | 'default') */
  getFieldState: (field: keyof T) => 'error' | 'success' | 'default';
  /** Get error message for a field */
  getFieldError: (field: keyof T) => string | undefined;
  /** Fields that have been touched (blurred at least once) */
  touchedFields: Set<keyof T>;
  /** Mark a field as touched */
  touchField: (field: keyof T) => void;
}

// --- Built-in Validators ---

/** Field is required (non-empty string, non-null, non-undefined) */
export const required = (message = 'This field is required'): ValidationRule => ({
  validate: (value) => {
    if (value === null || value === undefined) return message;
    if (typeof value === 'string' && !value.trim()) return message;
    if (Array.isArray(value) && value.length === 0) return message;
    return null;
  },
});

/** Minimum string length */
export const minLength = (min: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (typeof value !== 'string') return null;
    if (value.trim().length > 0 && value.trim().length < min)
      return message || `Must be at least ${min} characters`;
    return null;
  },
});

/** Maximum string length */
export const maxLength = (max: number, message?: string): ValidationRule => ({
  validate: (value) => {
    if (typeof value !== 'string') return null;
    if (value.length > max)
      return message || `Must be no more than ${max} characters`;
    return null;
  },
});

/** Match a regex pattern */
export const pattern = (regex: RegExp, message: string): ValidationRule => ({
  validate: (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    return regex.test(value) ? null : message;
  },
});

/** Valid email format */
export const email = (message = 'Please enter a valid email address'): ValidationRule => ({
  validate: (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : message;
  },
});

/** Custom validation function */
export const custom = <T = any>(
  fn: (value: any, formData: T) => string | null | undefined
): ValidationRule<T> => ({
  validate: fn,
});

// --- Hook ---

export function useFormValidation<T extends Record<string, any>>(
  rules: FieldRules<T>,
  formDataRef?: React.MutableRefObject<T>
): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const [touchedFields, setTouchedFields] = useState<Set<keyof T>>(new Set());
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const validateField = useCallback(
    (field: keyof T, value: any): string | null => {
      const fieldRules = rulesRef.current[field];
      if (!fieldRules) return null;

      const formData = formDataRef?.current || ({} as T);
      for (const rule of fieldRules) {
        const error = rule.validate(value, formData);
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
          return error;
        }
      }

      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return null;
    },
    [formDataRef]
  );

  const validateAll = useCallback(
    (formData: T): boolean => {
      const newErrors: FieldErrors<T> = {};
      let isValid = true;

      for (const field of Object.keys(rulesRef.current) as (keyof T)[]) {
        const fieldRules = rulesRef.current[field];
        if (!fieldRules) continue;

        for (const rule of fieldRules) {
          const error = rule.validate(formData[field], formData);
          if (error) {
            newErrors[field] = error;
            isValid = false;
            break;
          }
        }
      }

      setErrors(newErrors);
      // Mark all fields as touched on full validation
      setTouchedFields(new Set(Object.keys(rulesRef.current) as (keyof T)[]));
      return isValid;
    },
    []
  );

  const setFieldError = useCallback((field: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: keyof T) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const getFieldState = useCallback(
    (field: keyof T): 'error' | 'success' | 'default' => {
      if (errors[field]) return 'error';
      return 'default';
    },
    [errors]
  );

  const getFieldError = useCallback(
    (field: keyof T): string | undefined => {
      return errors[field];
    },
    [errors]
  );

  const touchField = useCallback((field: keyof T) => {
    setTouchedFields((prev) => new Set(prev).add(field));
  }, []);

  const hasErrors = Object.keys(errors).length > 0;

  return {
    errors,
    hasErrors,
    validateField,
    validateAll,
    setFieldError,
    clearFieldError,
    clearErrors,
    getFieldState,
    getFieldError,
    touchedFields,
    touchField,
  };
}
