import { useCallback, useState } from "react";

export type FieldErrors = Record<string, string>;

export interface FieldErrorProps {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function errorId(inputId: string): string {
  return `${inputId}-error`;
}

/**
 * Moves focus to the first invalid control after errors are set, so the user
 * sees the error message without manually scrolling inside a long dialog.
 */
function focusFirstError(merged: FieldErrors) {
  if (typeof document === "undefined") return;
  const firstKey = Object.keys(merged)[0];
  if (!firstKey) return;
  // Find the input whose aria-describedby references this field's error id.
  // fieldProps sets aria-describedby to "<inputId>-error" when there is an
  // error, so we query for any [aria-invalid="true"] element.
  const invalidEl = document.querySelector<HTMLElement>(
    '[aria-invalid="true"]',
  );
  if (invalidEl) {
    invalidEl.focus();
    invalidEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/**
 * Keeps validation messages next to their controls and exposes the ARIA
 * relationship that lets screen readers connect a field to its error text.
 */
export function useFieldErrors() {
  const [errors, setErrorsState] = useState<FieldErrors>({});

  const setErrors = useCallback((next: FieldErrors) => {
    setErrorsState((current) => {
      const merged: FieldErrors = { ...current };
      for (const [key, value] of Object.entries(next)) {
        if (value) merged[key] = value;
        else delete merged[key];
      }
      // Defer focus until after React re-renders the aria-invalid attributes.
      requestAnimationFrame(() => focusFirstError(merged));
      return merged;
    });
  }, []);

  const setError = useCallback(
    (key: string, value: string) => {
      setErrors({ [key]: value });
    },
    [setErrors],
  );

  const clearErrors = useCallback(() => setErrorsState({}), []);
  const clearError = useCallback(
    (key: string) => {
      setErrors({ [key]: "" });
    },
    [setErrors],
  );

  const fieldProps = useCallback(
    (
      key: string,
      inputId: string,
      describedIds: string[] = [],
    ): FieldErrorProps => {
      const error = errors[key];
      const ids = error ? [errorId(inputId), ...describedIds] : describedIds;
      return {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
      };
    },
    [errors],
  );

  return {
    errors,
    setError,
    setErrors,
    clearError,
    clearErrors,
    fieldProps,
  };
}
