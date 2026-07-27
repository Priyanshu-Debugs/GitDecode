/**
 * GitDecode — Email Validation Utility
 * ====================================
 * Comprehensive frontend email format checking.
 */

export interface EmailValidationResult {
  isValid: boolean;
  message: string | null;
}

export function validateEmail(email: string): EmailValidationResult {
  const trimmed = email.trim();

  if (!trimmed) {
    return { isValid: false, message: "Email ID is required." };
  }

  // Standard RFC 5322 pattern check
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(trimmed)) {
    return { isValid: false, message: "Please enter a valid email address (e.g. name@domain.com)." };
  }

  return { isValid: true, message: null };
}
