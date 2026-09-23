const COMMON_PASSWORDS = new Set([
  "password123456!",
  "password123456",
  "12345678901234",
  "abcdefghijklmN1!",
  "abcdefghijklM1!",
  "passwordpassword",
  "qwertyuiopasdf",
  "letmein12345678",
  "welcome1234567",
  "admin123456789",
]);

export type PasswordPolicyResult = {
  valid: boolean;
  score: number;
  errors: string[];
};

export function validatePassword(
  password: string,
  identifiers: string[] = [],
): PasswordPolicyResult {
  const normalized = password.toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  const errors: string[] = [];
  if (password.length < 14) errors.push("Use at least 14 characters.");
  if (password.length > 128) errors.push("Use no more than 128 characters.");
  if (!/[A-Z]/.test(password)) errors.push("Include an uppercase letter.");
  if (!/[a-z]/.test(password)) errors.push("Include a lowercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Include a special character.");
  if (COMMON_PASSWORDS.has(normalized) || /(.)\1{3,}/.test(password))
    errors.push("Avoid common or repeated passwords.");
  const identifierTokens = identifiers
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
  if (identifierTokens.some((value) => compact.includes(value)))
    errors.push("Do not use your name or email in the password.");

  const score = Math.min(
    4,
    [
      password.length >= 14,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length,
  );
  return { valid: errors.length === 0, score, errors };
}

export function passwordPolicyMessage(password: string, identifiers: string[] = []): string | true {
  const result = validatePassword(password, identifiers);
  return result.valid ? true : (result.errors[0] ?? "Password does not meet the requirements.");
}
