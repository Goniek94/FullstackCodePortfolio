/**
 * Rate Limiting Middleware - Production-Ready Secure Version
 *
 * SECURITY FEATURES:
 * ✅ req.ip (requires trust proxy)
 * ✅ HMAC for email (PII protection)
 * ✅ msBeforeNext fallback
 * ✅ skipSuccessfulRequests for auth
 * ✅ Enforces RL_SECRET in production
 *
 * REQUIRED: Add app.set("trust proxy", 1) in app.js
 */

import rateLimit from "express-rate-limit";
import crypto from "crypto";
import logger from "../utils/logger.js";

const isProd = process.env.NODE_ENV === "production";
const secret = process.env.RL_SECRET || "change-me-in-production";

// Enforce secret key in production (safety check)
if (isProd && secret === "change-me-in-production") {
  throw new Error("RL_SECRET must be set in production");
}

/* ----------------------------- Helpers ----------------------------- */

// Normalize IP (e.g., ::1 -> 127.0.0.1 in dev)
const normalizeIp = (ip) => (ip === "::1" ? "127.0.0.1" : ip || "unknown");

// SECURE: req.ip (requires trust proxy in app.js)
const getClientIp = (req) => normalizeIp(req.ip);

// Normalize email
const normEmail = (e = "") => String(e).toLowerCase().trim();

// HMAC instead of plaintext email (GDPR/PII protection)
const hashEmail = (e = "") =>
  crypto.createHmac("sha256", secret).update(normEmail(e)).digest("base64url");

// Readable mask for logs
const maskEmail = (e = "") =>
  e ? e.replace(/(^.{2}).*(@.*$)/, "$1***$2") : "unknown";

// Skip limiters (DEV/disabled/CORS preflight)
const shouldSkip = (req) => {
  if (!isProd || process.env.RATE_LIMIT_DISABLED === "1") return true;
  if (req.method === "OPTIONS") return true;
  return false;
};

/**
 * Create rate limiter with standardized configuration
 * @param {Object} config - Limiter configuration
 * @returns {Function} - Express middleware
 */
const makeLimiter = ({
  windowMs,
  max,
  keyGenerator,
  code,
  message,
  skipSuccessful,
}) =>
  rateLimit({
    windowMs,
    max,
    keyGenerator,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false,
    skip: shouldSkip,
    skipSuccessfulRequests: skipSuccessful || false,
    handler: (req, res) => {
      const ip = getClientIp(req);
      const emailMasked = maskEmail(req.body?.email || "");

      // Safe retry-after calculation (fallback for different express-rate-limit versions)
      const retryMs =
        req.rateLimit?.msBeforeNext ??
        (req.rateLimit?.resetTime
          ? Math.max(
              0,
              new Date(req.rateLimit.resetTime).getTime() - Date.now()
            )
          : windowMs);

      const retryAfterSec = Math.max(1, Math.ceil(retryMs / 1000));

      logger.warn(
        `${code} exceeded ip=${ip} email=${emailMasked} path=${
          req.originalUrl
        } ua=${req.get("User-Agent")}`
      );

      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: message,
        code,
        retryAfter: retryAfterSec,
      });
    },
  });

/* --------------------------- Limiter Keys --------------------------- */

// SECURE: IP + HMAC(email)
const emailAwareKey = (req) =>
  `${getClientIp(req)}:${hashEmail(req.body?.email || "")}`;

const ipOnlyKey = (req) => getClientIp(req);

/* ------------------------------ Limiters ------------------------------ */

/**
 * Global API rate limiter
 * 600 requests per minute per IP
 */
export const apiLimiter = makeLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 600,
  keyGenerator: ipOnlyKey,
  code: "API_RATE_LIMIT_EXCEEDED",
  message: "Too many requests. Please slow down.",
});

/**
 * Authentication rate limiter
 * 30 attempts per 15 minutes per IP+email
 * Skips successful login attempts
 */
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  keyGenerator: emailAwareKey,
  code: "RATE_LIMIT_EXCEEDED",
  message: "Too many login attempts. Please try again later.",
  skipSuccessful: true, // Don't count successful logins
});

/**
 * Admin login rate limiter
 * 10 attempts per hour per IP+email
 * More restrictive than regular auth
 */
export const adminLoginLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: emailAwareKey,
  code: "ADMIN_RATE_LIMIT_EXCEEDED",
  message: "Too many admin login attempts. Please try again later.",
  skipSuccessful: true,
});

/**
 * Password reset rate limiter
 * 5 attempts per hour per IP+email
 */
export const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: emailAwareKey,
  code: "PASSWORD_RESET_LIMIT_EXCEEDED",
  message: "Too many password reset attempts. Please try again later.",
});

/**
 * Registration rate limiter
 * 20 attempts per hour per IP+email
 */
export const registrationLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: emailAwareKey,
  code: "REGISTRATION_LIMIT_EXCEEDED",
  message: "Too many registration attempts. Please try again later.",
});

/**
 * Message rate limiter - 5 second cooldown
 * Prevents spam by enforcing 5-second delay between messages
 */
export const messageRateLimiter = makeLimiter({
  windowMs: 5 * 1000, // 5 seconds
  max: 1,
  keyGenerator: (req) => req.user?.userId || ipOnlyKey(req),
  code: "MESSAGE_RATE_LIMIT_EXCEEDED",
  message: "Please wait a moment before sending another message.",
});

/**
 * Message rate limiter - hourly limit
 * 50 messages per hour per user
 */
export const messageHourlyLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  keyGenerator: (req) => req.user?.userId || ipOnlyKey(req),
  code: "MESSAGE_HOURLY_LIMIT_EXCEEDED",
  message: "Hourly message limit reached (50). Please try again later.",
});

/**
 * Search endpoints rate limiter
 * 60 searches per minute per IP
 */
export const searchLimiter = makeLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: ipOnlyKey,
  code: "SEARCH_RATE_LIMIT_EXCEEDED",
  message: "Too many search requests. Please slow down.",
});

/**
 * Metadata endpoints rate limiter
 * 30 requests per minute per IP
 */
export const metadataLimiter = makeLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: ipOnlyKey,
  code: "METADATA_RATE_LIMIT_EXCEEDED",
  message: "Too many metadata requests. Please slow down.",
});

/* ---------------------- Backward compatibility ---------------------- */
export { authLimiter as checkUserRole };

export default {
  authLimiter,
  adminLoginLimiter,
  passwordResetLimiter,
  registrationLimiter,
  apiLimiter,
  messageRateLimiter,
  messageHourlyLimiter,
  searchLimiter,
  metadataLimiter,
};
