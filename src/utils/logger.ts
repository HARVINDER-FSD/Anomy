/**
 * 🛡️ Enterprise Security & Privacy Logger for AnuFy
 * (Meta, Google, Microsoft Industrial Logging Standard)
 *
 * Rules:
 * 1. NO PII or sensitive credentials (passwords, tokens, OTPs, emails, phones, addresses, message contents).
 * 2. Sanitize & mask objects automatically.
 * 3. Logger.debug() -> __DEV__ only.
 * 4. Logger.perf()  -> High-value performance metrics.
 * 5. Logger.info(), Logger.warn(), Logger.error() -> Safe operational logging.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'otp',
  'secret',
  'authorization',
  'auth',
  'cookie',
  'sessionid',
  'email',
  'phone',
  'phonenumber',
  'mobile',
  'address',
  'dob',
  'date_of_birth',
  'birthday',
  'bio',
  'location',
  'blocked_users',
  'card',
  'cvv',
  'upi',
  'aadhaar',
  'pan',
  'passport',
]);

/**
 * Recursively sanitize objects to prevent leaking PII or full objects in logs.
 */
function sanitizeData(data: any, depth = 0): any {
  if (data === null || data === undefined) return data;
  if (depth > 3) return '[Max Depth Exceeded]';

  if (typeof data === 'string') {
    // Mask potential JWT tokens or sensitive authorization strings
    if (data.startsWith('Bearer ') || data.length > 150) {
      return '[MASKED_TOKEN]';
    }
    return data;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    if (data.length > 10) {
      return `[Array(${data.length}) truncated]`;
    }
    return data.map((item) => sanitizeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(data[key], depth + 1);
      }
    }
    return sanitized;
  }

  return String(data);
}

class EnterpriseLogger {
  private static instance: EnterpriseLogger;

  private constructor() {}

  public static getInstance(): EnterpriseLogger {
    if (!EnterpriseLogger.instance) {
      EnterpriseLogger.instance = new EnterpriseLogger();
    }
    return EnterpriseLogger.instance;
  }

  /**
   * ⚡ Performance Metric Logging
   */
  public perf(category: string, message: string, details?: Record<string, any>) {
    const formattedDetails = details ? JSON.stringify(sanitizeData(details)) : '';
  }

  /**
   * ℹ️ Safe Operational Info Logs (Production & Dev)
   */
  public info(event: string, details?: Record<string, any>) {
    const sanitized = details ? JSON.stringify(sanitizeData(details)) : '';
  }

  /**
   * 🐛 Debug Logs (__DEV__ mode only)
   */
  public debug(tag: string, message: string, details?: Record<string, any>) {
    if (!__DEV__) return;
    const sanitized = details ? JSON.stringify(sanitizeData(details)) : '';
  }

  /**
   * ⚠️ Warning Logs
   */
  public warn(tag: string, message: string, details?: Record<string, any>) {
    const sanitized = details ? JSON.stringify(sanitizeData(details)) : '';
  }

  /**
   * ❌ Error Logs with PII Masking
   */
  public error(tag: string, message: string, error?: any) {
    const errDetails = error instanceof Error
      ? { name: error.name, message: error.message }
      : sanitizeData(error);
  }
}

export const Logger = EnterpriseLogger.getInstance();
