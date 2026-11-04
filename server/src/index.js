import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import nodemailer from 'nodemailer';

import {
  readProductsFromSheet,
  readAdminByEmail,
  readUserByEmail,
  readCustomersFromSheet,
  readAdminsFromSheet,
  createAdminInSheet,
  updateAdminInSheet,
  deleteAdminFromSheet,
  createCustomerInSheet,
  createProductInSheet,
  updateProductInSheet,
  deleteProductFromSheet,
  createOrderInSheet,
  readOrdersFromSheet,
  updateOrderStatusInSheet,
  savePasswordResetToken,
  consumePasswordResetToken,
  savePendingAdminMfaSecret,
  enableAdminMfaInSheet,
  consumeAdminMfaRecoveryHash,
  revokeAccountSessionsInSheet,
  appendSecurityAuditLog,
  readSecurityAuditLogs,
  readSecurityAttemptState,
  appendSecurityAttempt,
  readRecentSecurityAttempts
} from './google.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_NAME = 'nova_session';
const MFA_SETUP_COOKIE = 'nova_mfa_setup';
const MFA_CHALLENGE_COOKIE = 'nova_mfa_challenge';
const MFA_CHALLENGE_DURATION = 10 * 60 * 1000;
const JWT_ISSUER = 'nova-market-api';
const JWT_AUDIENCE = 'nova-market';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // Absolute maximum lifetime
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000; // Sliding inactivity timeout

function parseAllowedClientOrigins() {
  const configured = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN ||
    (isProduction ? '' : 'http://localhost:5173');
  if (!configured.trim()) {
    throw new Error('Set CLIENT_ORIGIN or CLIENT_ORIGINS to the exact frontend origin(s).');
  }

  const origins = configured.split(',').map(value => value.trim()).filter(Boolean);
  const parsed = origins.map(value => {
    let parsedUrl;
    try { parsedUrl = new URL(value); } catch {
      throw new Error(`Invalid client origin: ${value}`);
    }
    if (parsedUrl.origin !== value.replace(/\/$/, '') || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Client origin must contain only scheme, host and optional port: ${value}`);
    }
    if (isProduction && parsedUrl.protocol !== 'https:') {
      throw new Error('Production client origins must use HTTPS.');
    }
    return parsedUrl.origin;
  });
  return new Set(parsed);
}

const allowedClientOrigins = parseAllowedClientOrigins();
const cookieSameSite = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAME_SITE must be lax, strict or none.');
}
if (cookieSameSite === 'none' && !isProduction) {
  throw new Error('COOKIE_SAME_SITE=none requires HTTPS and should only be used in production.');
}

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: cookieSameSite,
  path: '/'
};

function validateProductionConfiguration() {
  if (!isProduction) return;
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 64) {
    throw new Error('Production requires a cryptographically random JWT_SECRET of at least 64 characters.');
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('Production requires GOOGLE_SHEET_ID.');
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || '')) {
    throw new Error('Production requires MFA_ENCRYPTION_KEY as 64 hexadecimal characters.');
  }
  if (process.env.CLIENT_ORIGIN && !allowedClientOrigins.has(new URL(process.env.CLIENT_ORIGIN).origin)) {
    throw new Error('CLIENT_ORIGIN must be included in CLIENT_ORIGINS when both are configured.');
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Production password recovery requires SMTP_HOST, SMTP_USER and SMTP_PASS.');
  }
  if (process.env.K_SERVICE && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Do not set GOOGLE_APPLICATION_CREDENTIALS on Cloud Run. Use the Cloud Run service identity and Application Default Credentials.');
  }
}

validateProductionConfiguration();

// Generate a dummy hash to reduce login timing differences.
const dummyPasswordHashPromise = bcrypt.hash(
  randomBytes(32).toString('hex'),
  12
);

app.disable('x-powered-by');
app.set('trust proxy', process.env.K_SERVICE || process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, false);
    return callback(null, allowedClientOrigins.has(origin) ? origin : false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  maxAge: 600
}));

// Cookie-authenticated mutations must originate from the configured NOVA
// frontend. CORS alone is not a CSRF defence because it does not block all
// cross-origin requests from being sent.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (!origin || !allowedClientOrigins.has(origin)) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  return next();
});

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

// Login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.'
  }
});

const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please wait and try again.' }
});

// Registration rate limiter
const registerLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many registration attempts. Please try again later.'
  }
});

// Password reset endpoints have their own limits to reduce email abuse.
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' }
});

const passwordResetSubmitLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again later.' }
});


// Persistent suspicious-authentication detection backed by Google Sheets.
// The HMAC key hides the normalized email + request IP + auth phase. Raw IPs,
// passwords, MFA codes and recovery codes are never written to this tab.
const SUSPICIOUS_AUTH_WINDOW_MS = 10 * 60_000;
const SUSPICIOUS_AUTH_THRESHOLD = 5;
const SUSPICIOUS_AUTH_BLOCK_MS = 15 * 60_000;

// Serialize reads/writes within this Node process. Google Sheets does not offer
// database transactions or row locks; keep the production service to one
// instance when relying on this Sheets-backed lockout mechanism.
let suspiciousAuthQueue = Promise.resolve();
function runSuspiciousAuthTask(task) {
  const pending = suspiciousAuthQueue.then(task, task);
  suspiciousAuthQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function suspiciousAuthKey(req, identifier, phase) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase().slice(0, 254);
  return createHmac('sha256', getJwtSecret())
    .update(`${phase}|${normalizedIdentifier}|${ip}`)
    .digest('hex');
}

function suspiciousAuthRetryState(blockedUntilMs, now = Date.now()) {
  if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= now) return { blocked: false };
  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000))
  };
}

async function getSuspiciousAuthCooldown(req, identifier, phase) {
  const keyHash = suspiciousAuthKey(req, identifier, phase);
  return runSuspiciousAuthTask(async () => {
    const now = Date.now();
    const state = await readSecurityAttemptState({
      keyHash,
      phase,
      nowIso: new Date(now).toISOString(),
      windowStartIso: new Date(now - SUSPICIOUS_AUTH_WINDOW_MS).toISOString()
    });
    return { ...suspiciousAuthRetryState(Date.parse(state.blockedUntil || ''), now), keyHash };
  });
}

async function recordSuspiciousAuthFailure(req, { identifier, phase, targetRole = '' }) {
  const keyHash = suspiciousAuthKey(req, identifier, phase);
  return runSuspiciousAuthTask(async () => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const state = await readSecurityAttemptState({
      keyHash,
      phase,
      nowIso,
      windowStartIso: new Date(now - SUSPICIOUS_AUTH_WINDOW_MS).toISOString()
    });
    const activeBlock = suspiciousAuthRetryState(Date.parse(state.blockedUntil || ''), now);
    if (activeBlock.blocked) return activeBlock;

    await appendSecurityAttempt({
      timestamp: nowIso,
      keyHash,
      phase,
      eventType: 'failure',
      blockedUntil: ''
    });

    const failureCount = Number(state.failureCount || 0) + 1;
    if (failureCount >= SUSPICIOUS_AUTH_THRESHOLD) {
      const blockedUntil = new Date(now + SUSPICIOUS_AUTH_BLOCK_MS).toISOString();
      await appendSecurityAttempt({
        timestamp: nowIso,
        keyHash,
        phase,
        eventType: 'block',
        blockedUntil
      });
      recordSecurityEvent(req, {
        event: 'auth.suspicious_login.detected',
        targetEmail: String(identifier || '').trim().toLowerCase(),
        targetRole,
        outcome: 'alert',
        summary: `${phase === 'mfa' ? 'MFA' : 'Password'} authentication had ${SUSPICIOUS_AUTH_THRESHOLD} failures within 10 minutes from the same network and identifier. That pair is temporarily throttled for 15 minutes.`
      });
      return suspiciousAuthRetryState(Date.parse(blockedUntil), now);
    }
    return { blocked: false };
  });
}

async function clearSuspiciousAuthFailures(req, identifier, phase) {
  const keyHash = suspiciousAuthKey(req, identifier, phase);
  return runSuspiciousAuthTask(() => appendSecurityAttempt({
    timestamp: new Date().toISOString(),
    keyHash,
    phase,
    eventType: 'clear',
    blockedUntil: ''
  }));
}

const demoProducts = [
  {
    id: 1,
    name: 'Studio Wireless Headphones',
    category: 'Electronics',
    price: 2999,
    oldPrice: 3999,
    rating: 4.8,
    reviews: 128,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',
    tag: 'BESTSELLER',
    description: 'Immersive sound, soft-touch comfort and a beautifully minimal finish.'
  },
  {
    id: 2,
    name: 'Everyday Runner Sneakers',
    category: 'Fashion',
    price: 3499,
    oldPrice: 4999,
    rating: 4.7,
    reviews: 94,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85',
    tag: '20% OFF',
    description: 'A versatile everyday sneaker made for long days and spontaneous plans.'
  },
  {
    id: 3,
    name: 'Arc Smart Watch',
    category: 'Electronics',
    price: 4499,
    oldPrice: 5499,
    rating: 4.6,
    reviews: 76,
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',
    tag: 'POPULAR',
    description: 'A clean, considered design that keeps your day in rhythm.'
  },
  {
    id: 4,
    name: 'Everyday Carry Tote',
    category: 'Fashion',
    price: 2299,
    oldPrice: 2799,
    rating: 4.9,
    reviews: 61,
    image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85',
    tag: 'NEW',
    description: 'A refined everyday carryall with space for all the essentials.'
  },
  {
    id: 5,
    name: 'Soft Glow Table Lamp',
    category: 'Home & Living',
    price: 1499,
    oldPrice: 1999,
    rating: 4.5,
    reviews: 48,
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85',
    tag: 'DESIGN PICK',
    description: 'Warm ambient light for slower evenings and calmer spaces.'
  },
  {
    id: 6,
    name: 'Daily Ritual Skincare Set',
    category: 'Beauty',
    price: 1899,
    oldPrice: 2299,
    rating: 4.7,
    reviews: 83,
    image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85',
    tag: 'VALUE SET',
    description: 'A simple daily routine, thoughtfully put together.'
  },
  {
    id: 7,
    name: 'Move Training Dumbbells',
    category: 'Sports & Fitness',
    price: 1299,
    oldPrice: 1599,
    rating: 4.6,
    reviews: 37,
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=85',
    tag: 'EVERYDAY ESSENTIAL',
    description: 'Compact, dependable training essentials for your home setup.'
  },
  {
    id: 8,
    name: 'Little Explorer Bear',
    category: 'Toys & Games',
    price: 899,
    oldPrice: 1199,
    rating: 4.9,
    reviews: 55,
    image: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=85',
    tag: 'GIFT PICK',
    description: 'A soft companion for playtime, gifting and little adventures.'
  }
];

// Validation schemas
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
});

const mfaCodeSchema = z.object({
  code: z.string().trim().min(6).max(32)
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254)
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().min(15).max(128)
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(15).max(128)
});

const productImageUrlSchema = z.string().url().max(2048).refine(
  value => new URL(value).protocol === 'https:',
  'Product images must use HTTPS.'
);

const productSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(80),
  price: z.number().positive().finite(),
  stock: z.number().int().nonnegative().max(1_000_000),
  image: productImageUrlSchema.optional().or(z.literal('')),
  images: z.array(productImageUrlSchema).max(8, 'A product can have at most 8 images.').optional(),
  description: z.string().max(4000).optional()
});

const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(100),
    quantity: z.number().int().min(1).max(100)
  })).min(1).max(30),
  shippingAddress: z.object({
    recipientName: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.'),
    addressLine1: z.string().trim().min(5).max(200),
    addressLine2: z.string().trim().max(200).optional().default(''),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.')
  })
});

const orderStatusSchema = z.object({
  status: z.enum(['Placed', 'Confirmed', 'Processing', 'Shipped', 'Delivered'])
});

const createAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(15).max(128),
  role: z.enum(['admin', 'manager'])
});

const updateManagedAdminSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(['admin', 'manager']).optional()
}).refine(value => value.active !== undefined || value.role !== undefined, {
  message: 'Choose an account status or role to update.'
});

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 64) {
    throw new Error('JWT_SECRET is missing or too short.');
  }

  return secret;
}


function recordSecurityEvent(req, event) {
  let ipFingerprint = '';
  try {
    const ip = String(req.ip || req.socket?.remoteAddress || '');
    if (ip) ipFingerprint = createHmac('sha256', getJwtSecret()).update(ip).digest('hex').slice(0, 24);
  } catch { /* Audit logging must never block the main security operation. */ }
  const payload = {
    timestamp: new Date().toISOString(),
    event: event.event,
    actorEmail: event.actorEmail || '',
    actorRole: event.actorRole || '',
    targetEmail: event.targetEmail || '',
    targetRole: event.targetRole || '',
    outcome: event.outcome || 'success',
    ipFingerprint,
    userAgent: String(req.get('user-agent') || '').slice(0, 180),
    summary: event.summary || ''
  };
  // Audit writes run out-of-band so Google Sheets latency does not delay logins,
  // MFA verification, product changes or administrator actions.
  void appendSecurityAuditLog(payload).catch(error => {
    console.error('[security-audit] Unable to write event:', event.event, error.message);
  });
}

function getVerifiedSessionForAudit(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    return {
      email: String(decoded.sub || ''),
      role: decoded.accountType === 'admin' ? 'admin' : decoded.accountType === 'customer' ? 'customer' : ''
    };
  } catch { return null; }
}

function hasCurrentSessionVersion(decoded, account) {
  const tokenVersion = decoded?.sessionVersion;
  const storedVersion = Number(account?.sessionVersion ?? 0);
  return Number.isSafeInteger(tokenVersion) &&
    Number.isSafeInteger(storedVersion) &&
    tokenVersion === storedVersion;
}

function getSessionTimes(decoded) {
  const issuedAt = Number(decoded?.authTime ?? (Number(decoded?.iat) * 1000));
  const lastActivity = Number(decoded?.lastActivity ?? (Number(decoded?.iat) * 1000));
  return { issuedAt, lastActivity };
}

function isSessionWithinLimits(decoded, now = Date.now()) {
  const { issuedAt, lastActivity } = getSessionTimes(decoded);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(lastActivity) || issuedAt <= 0 || lastActivity <= 0) return false;
  if (issuedAt > now + 30_000 || lastActivity > now + 30_000) return false;
  return now - issuedAt <= SESSION_DURATION && now - lastActivity <= SESSION_IDLE_TIMEOUT;
}

function refreshSessionCookie(res, decoded) {
  const now = Date.now();
  const { issuedAt } = getSessionTimes(decoded);
  const remainingAbsolute = SESSION_DURATION - (now - issuedAt);
  if (remainingAbsolute <= 0) return false;
  const payload = {
    sub: decoded.sub,
    accountType: decoded.accountType,
    sessionVersion: Number(decoded.sessionVersion ?? 0),
    authTime: issuedAt,
    lastActivity: now
  };
  if (decoded.accountType === 'admin') payload.mfaVerified = decoded.mfaVerified === true;
  const refreshed = jwt.sign(payload, getJwtSecret(), {
    expiresIn: '8h',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
  res.cookie(COOKIE_NAME, refreshed, {
    ...cookieOptions,
    maxAge: Math.max(1_000, Math.min(SESSION_IDLE_TIMEOUT, remainingAbsolute))
  });
  return true;
}

async function revokeRequestSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  res.clearCookie(COOKIE_NAME, cookieOptions);
  clearMfaChallengeCookies(res);
  if (!token) return { revoked: false, reason: 'no_session' };

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  } catch {
    // An expired or invalid JWT is already unusable; clear the browser cookie.
    return { revoked: false, reason: 'already_invalid' };
  }
  if (typeof decoded.sub !== 'string' || !['admin', 'customer'].includes(decoded.accountType)) {
    return { revoked: false, reason: 'invalid_claims' };
  }
  // Incrementing the account's sessionVersion invalidates every outstanding
  // session for this account, including copies on other browsers/devices.
  return revokeAccountSessionsInSheet({ email: decoded.sub, accountType: decoded.accountType });
}

function getMfaEncryptionKey() {
  const value = String(process.env.MFA_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('MFA_ENCRYPTION_KEY is not configured. Add a 64-character hexadecimal key to server/.env.');
  }
  return Buffer.from(value, 'hex');
}

function encryptMfaSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

function decryptMfaSecret(payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 3) throw new Error('Stored authenticator secret is invalid.');
  const [iv, tag, encrypted] = parts.map(part => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16 || !encrypted.length) {
    throw new Error('Stored authenticator secret is invalid.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  let bits = 0;
  let accumulator = 0;
  const output = [];
  for (const char of input) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Authenticator secret contains invalid characters.');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 255);
      accumulator &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

function totpForCounter(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function verifyTotp(secret, suppliedCode, now = Date.now()) {
  const code = String(suppliedCode || '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  const supplied = Buffer.from(code);
  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(totpForCounter(secret, counter + offset));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const raw = randomBytes(10).toString('hex').toUpperCase();
    return raw.match(/.{1,4}/g).join('-');
  });
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function adminAccountPayload(admin) {
  return {
    ok: true,
    accountType: 'admin',
    redirectTo: '/admin',
    account: { email: admin.email, fullName: admin.fullName, role: admin.role }
  };
}

function issueAdminSession(res, admin) {
  const now = Date.now();
  const token = jwt.sign({
    sub: admin.email,
    accountType: 'admin',
    mfaVerified: true,
    sessionVersion: Number(admin.sessionVersion ?? 0),
    authTime: now,
    lastActivity: now
  }, getJwtSecret(), {
    expiresIn: '8h',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_IDLE_TIMEOUT });
}

function createMfaChallengeToken(admin, purpose) {
  return jwt.sign({
    sub: admin.email,
    accountType: 'admin',
    mfaPurpose: purpose,
    sessionVersion: Number(admin.sessionVersion ?? 0)
  }, getJwtSecret(), {
    expiresIn: '10m',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

function setMfaChallengeCookie(res, cookieName, admin, purpose) {
  res.cookie(cookieName, createMfaChallengeToken(admin, purpose), {
    ...cookieOptions,
    maxAge: MFA_CHALLENGE_DURATION
  });
}

function clearMfaChallengeCookies(res) {
  res.clearCookie(MFA_SETUP_COOKIE, cookieOptions);
  res.clearCookie(MFA_CHALLENGE_COOKIE, cookieOptions);
}

async function getMfaChallengeAdmin(req, res, cookieName, expectedPurpose) {
  const token = req.cookies?.[cookieName];
  if (!token) {
    const error = new Error('Your verification step has expired. Please sign in again.');
    error.status = 401;
    throw error;
  }
  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  } catch {
    res.clearCookie(cookieName, cookieOptions);
    const error = new Error('Your verification step has expired. Please sign in again.');
    error.status = 401;
    throw error;
  }
  if (decoded.accountType !== 'admin' || decoded.mfaPurpose !== expectedPurpose || typeof decoded.sub !== 'string') {
    res.clearCookie(cookieName, cookieOptions);
    const error = new Error('Invalid verification session. Please sign in again.');
    error.status = 401;
    throw error;
  }
  const admin = await readAdminByEmail(decoded.sub);
  if (!admin || !admin.active || !['owner', 'admin', 'manager'].includes(admin.role) || !hasCurrentSessionVersion(decoded, admin)) {
    res.clearCookie(cookieName, cookieOptions);
    const error = new Error('Administrator account changed. Please sign in again.');
    error.status = 401;
    throw error;
  }
  return admin;
}

// Verify admin session.
async function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      error: 'Admin login required.'
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(401).json({
      error: 'Invalid or expired session.'
    });
  }

  if (!isSessionWithinLimits(decoded)) {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(401).json({ error: 'Your session expired after inactivity or reached its maximum lifetime. Please sign in again.' });
  }

  if (typeof decoded.sub !== 'string') {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(401).json({
      error: 'Invalid session.'
    });
  }

  if (decoded.accountType !== 'admin') {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(403).json({
      error: 'Admin access required.'
    });
  }

  if (decoded.mfaVerified !== true) {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(401).json({ error: 'Two-factor verification is required. Please sign in again.' });
  }

  try {
    const admin = await readAdminByEmail(decoded.sub);

    if (
      !admin ||
      !admin.active ||
      !['owner', 'admin', 'manager'].includes(admin.role)
    ) {
      res.clearCookie(COOKIE_NAME, cookieOptions);

      return res.status(401).json({
        error: 'Admin account is inactive or unavailable.'
      });
    }

    if (!hasCurrentSessionVersion(decoded, admin)) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Your session has been revoked. Please sign in again.' });
    }

    refreshSessionCookie(res, decoded);
    req.admin = {
      email: admin.email,
      role: admin.role,
      fullName: admin.fullName
    };

    return next();

  } catch (error) {
    console.error('Admin verification failed:', error.message);

    return res.status(503).json({
      error: 'Admin verification is temporarily unavailable.'
    });
  }
}


// Only the store owner can create or manage other administrator accounts.
function requireOwner(req, res, next) {
  return requireAdmin(req, res, () => {
    if (req.admin?.role !== 'owner') {
      recordSecurityEvent(req, { event: 'authorization.owner_only_denied', actorEmail: req.admin?.email, actorRole: req.admin?.role, outcome: 'denied', summary: 'Attempted owner-only administrator management.' });
      return res.status(403).json({ error: 'Only the store owner can manage administrator accounts.' });
    }
    return next();
  });
}

// Verify a customer session and load the customer record from the Users sheet.
async function requireCustomer(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Please sign in with a customer account.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  if (!isSessionWithinLimits(decoded)) {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(401).json({ error: 'Your session expired after inactivity or reached its maximum lifetime. Please sign in again.' });
  }

  if (decoded.accountType !== 'customer' || typeof decoded.sub !== 'string') {
    return res.status(403).json({ error: 'Customer access is required to place an order.' });
  }

  try {
    const customer = await readUserByEmail(decoded.sub);
    if (!customer) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Customer account is unavailable.' });
    }
    if (!hasCurrentSessionVersion(decoded, customer)) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Your session has been revoked. Please sign in again.' });
    }

    refreshSessionCookie(res, decoded);
    req.customer = {
      id: customer.id,
      name: customer.name,
      email: customer.email
    };
    return next();
  } catch (error) {
    console.error('Customer verification failed:', error.message);
    return res.status(503).json({ error: 'Customer verification is temporarily unavailable.' });
  }
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'nova-market-api',
    mode: isProduction ? 'production' : 'development'
  });
});

// Public product catalogue
app.get('/api/products', async (_req, res) => {
  if (!process.env.GOOGLE_SHEET_ID) {
    if (!isProduction) return res.json(demoProducts);
    return res.status(503).json({ error: 'Product catalogue is not configured.' });
  }

  try {
    const products = await readProductsFromSheet();

    return res.json(products);

  } catch (error) {
    console.error('Google Sheets read failed:', error.message);

    return res.status(503).json({
      error: 'Product catalogue is temporarily unavailable.'
    });
  }
});

// Add product (admin only)
app.post('/api/products', requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid product information.',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await createProductInSheet(parsed.data);

    recordSecurityEvent(req, { event: 'catalog.product.created', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: String(result.product?.id || ''), outcome: 'success', summary: 'Product added to catalogue.' });
    return res.status(201).json({
      ok: true,
      message: 'Product added successfully.',
      product: result.product
    });

  } catch (error) {
    console.error('Product creation failed:', error.message);

    return res.status(503).json({
      error: 'Unable to save product. Please try again.'
    });
  }
});

// Update an existing product (admin only).
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const productId = String(req.params.id ?? '').trim();
  if (!productId || productId.length > 100) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid product information.',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await updateProductInSheet(productId, parsed.data);
    if (!result.updated) {
      return res.status(404).json({ error: 'Product was not found.' });
    }
    recordSecurityEvent(req, { event: 'catalog.product.updated', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: productId, outcome: 'success', summary: 'Product catalogue entry updated.' });
    return res.json({
      ok: true,
      message: 'Product updated successfully.',
      product: result.product
    });
  } catch (error) {
    console.error('Product update failed:', error.message);
    return res.status(503).json({
      error: 'Unable to update product. Please try again.'
    });
  }
});

// Delete a product (admin only).
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const productId = String(req.params.id ?? '').trim();
  if (!productId || productId.length > 100) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  try {
    const result = await deleteProductFromSheet(productId);
    if (!result.deleted) {
      return res.status(404).json({ error: 'Product was not found.' });
    }
    recordSecurityEvent(req, { event: 'catalog.product.deleted', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: productId, outcome: 'success', summary: 'Product removed from catalogue.' });
    return res.json({
      ok: true,
      message: 'Product deleted successfully.',
      id: result.id
    });
  } catch (error) {
    console.error('Product deletion failed:', error.message);
    return res.status(503).json({
      error: 'Unable to delete product. Please try again.'
    });
  }
});


// Customer checkout: order totals and available stock are calculated by the server.
app.post('/api/orders', requireCustomer, async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Please check your delivery details and order items.',
      details: parsed.error.flatten()
    });
  }

  try {
    const result = await createOrderInSheet({
      customer: req.customer,
      items: parsed.data.items,
      shippingAddress: parsed.data.shippingAddress
    });
    return res.status(201).json({
      ok: true,
      message: 'Your order has been placed successfully.',
      order: result.order
    });
  } catch (error) {
    console.error('Order creation failed:', error.message);
    const conflicts = new Set([
      'STOCK_NOT_CONFIGURED',
      'STOCK_INVALID',
      'INSUFFICIENT_STOCK',
      'PRODUCT_NOT_FOUND',
      'PRODUCT_PRICE_INVALID'
    ]);
    if (conflicts.has(error.code)) {
      const status = error.code === 'PRODUCT_NOT_FOUND' ? 404 : 409;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    if (error.code === 'ORDER_HEADERS_MISMATCH') {
      return res.status(503).json({
        error: 'The Orders sheet headers need to be set up before checkout can be used.'
      });
    }
    return res.status(503).json({ error: 'Unable to place your order right now. Please try again.' });
  }
});

// Customers can only retrieve their own order history.
app.get('/api/orders/me', requireCustomer, async (req, res) => {
  try {
    const orders = await readOrdersFromSheet({ customerId: req.customer.id });
    return res.json({ ok: true, orders });
  } catch (error) {
    console.error('Customer order history failed:', error.message);
    return res.status(503).json({ error: 'Unable to load your order history right now.' });
  }
});

// Admin order list.
app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  try {
    const orders = await readOrdersFromSheet();
    return res.json({ ok: true, orders });
  } catch (error) {
    console.error('Admin order list failed:', error.message);
    return res.status(503).json({ error: 'Unable to load orders right now.' });
  }
});

// Admin order status update.
app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const orderId = String(req.params.id ?? '').trim();
  if (!orderId || orderId.length > 100) {
    return res.status(400).json({ error: 'Invalid order ID.' });
  }
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Choose a valid order status.' });
  }

  try {
    const result = await updateOrderStatusInSheet(orderId, parsed.data.status);
    if (!result.updated) return res.status(404).json({ error: 'Order was not found.' });
    recordSecurityEvent(req, { event: 'order.status.updated', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: orderId, outcome: 'success', summary: `Order status changed to ${parsed.data.status}.` });
    return res.json({ ok: true, message: 'Order status updated.', order: result.order });
  } catch (error) {
    console.error('Order status update failed:', error.message);
    return res.status(503).json({ error: 'Unable to update order status right now.' });
  }
});

// -------------------------
// Customer and administrator management
// -------------------------

// Owner-only security audit log viewer. The log sheet has no app-level update/delete endpoint.


// Owner-only security monitoring feed. The API returns recent audit activity
// plus sanitized attempt-state records for summaries and active lockouts.
app.get('/api/admin/security-monitoring', requireOwner, async (req, res) => {
  const requestedLogs = Number(req.query.limit || 250);
  const requestedAttempts = Number(req.query.attemptLimit || 500);
  const logLimit = Number.isSafeInteger(requestedLogs) ? Math.max(1, Math.min(250, requestedLogs)) : 250;
  const attemptLimit = Number.isSafeInteger(requestedAttempts) ? Math.max(1, Math.min(1000, requestedAttempts)) : 500;
  try {
    const [logs, attempts] = await Promise.all([
      readSecurityAuditLogs(logLimit),
      readRecentSecurityAttempts(attemptLimit)
    ]);
    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      logs,
      attempts
    });
  } catch (error) {
    console.error('Security monitoring feed failed:', error.message);
    return res.status(503).json({ error: 'Unable to load security monitoring data right now.' });
  }
});

app.get('/api/admin/security-logs', requireOwner, async (req, res) => {
  const requested = Number(req.query.limit || 100);
  const limit = Number.isSafeInteger(requested) ? Math.max(1, Math.min(250, requested)) : 100;
  try {
    const logs = await readSecurityAuditLogs(limit);
    return res.json({ ok: true, logs });
  } catch (error) {
    console.error('Security audit log read failed:', error.message);
    return res.status(503).json({ error: 'Unable to load security audit logs right now.' });
  }
});

// Any authenticated admin role may view the customer directory.
app.get('/api/admin/customers', requireAdmin, async (_req, res) => {
  try {
    const customers = await readCustomersFromSheet();
    return res.json({ ok: true, customers });
  } catch (error) {
    console.error('Customer directory failed:', error.message);
    return res.status(503).json({ error: 'Unable to load customers right now.' });
  }
});

// Only the owner can see administrator accounts.
app.get('/api/admin/admins', requireOwner, async (_req, res) => {
  try {
    const admins = await readAdminsFromSheet();
    return res.json({ ok: true, admins });
  } catch (error) {
    console.error('Admin directory failed:', error.message);
    return res.status(503).json({ error: 'Unable to load administrator accounts.' });
  }
});

// Create a manager or admin account. New owners must be provisioned separately.
app.post('/api/admin/admins', requireOwner, async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Enter a valid name, email, role and a temporary password of at least 15 characters.'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await createAdminInSheet({
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      passwordHash,
      role: parsed.data.role
    });
    if (!result.created) {
      return res.status(409).json({ error: 'This email is already used by a customer or administrator.' });
    }
    recordSecurityEvent(req, { event: 'admin.account.created', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: result.admin?.email || parsed.data.email, targetRole: parsed.data.role, outcome: 'success', summary: 'Administrator account created.' });
    return res.status(201).json({
      ok: true,
      message: 'Administrator account created successfully.',
      admin: result.admin
    });
  } catch (error) {
    console.error('Administrator creation failed:', error.message);
    return res.status(503).json({ error: 'Unable to create the administrator account.' });
  }
});

// Change a managed admin/manager role or deactivate/reactivate the account.
app.patch('/api/admin/admins/:email', requireOwner, async (req, res) => {
  const email = String(req.params.email ?? '').trim().toLowerCase();
  if (!email || email.length > 254) {
    return res.status(400).json({ error: 'Invalid administrator email.' });
  }
  if (email === req.admin.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot change your own administrator account here.' });
  }

  const parsed = updateManagedAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Choose a valid role or account status.' });
  }

  try {
    const target = await readAdminByEmail(email);
    if (!target) return res.status(404).json({ error: 'Administrator account not found.' });
    if (target.role === 'owner') {
      return res.status(403).json({ error: 'The owner account is protected and cannot be changed here.' });
    }

    const result = await updateAdminInSheet(email, parsed.data);
    if (!result.updated) {
      return res.status(404).json({ error: 'Administrator account was not updated.' });
    }
    recordSecurityEvent(req, { event: 'admin.account.updated', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: email, targetRole: result.admin?.role || target.role, outcome: 'success', summary: `Administrator account changed: ${Object.keys(parsed.data).join(', ')}.` });
    return res.json({
      ok: true,
      message: 'Administrator account updated successfully.',
      admin: result.admin
    });
  } catch (error) {
    console.error('Administrator update failed:', error.message);
    return res.status(503).json({ error: 'Unable to update the administrator account.' });
  }
});

// Permanently delete a managed admin/manager account. The owner account
// and the currently signed-in owner are protected at the API boundary.
app.delete('/api/admin/admins/:email', requireOwner, async (req, res) => {
  const email = String(req.params.email ?? '').trim().toLowerCase();
  if (!email || email.length > 254) {
    return res.status(400).json({ error: 'Invalid administrator email.' });
  }
  if (email === req.admin.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete your own administrator account.' });
  }

  try {
    const target = await readAdminByEmail(email);
    if (!target) {
      return res.status(404).json({ error: 'Administrator account not found.' });
    }
    if (target.role === 'owner') {
      return res.status(403).json({ error: 'The owner account is protected and cannot be deleted.' });
    }

    const result = await deleteAdminFromSheet(email);
    if (!result.deleted) {
      if (result.reason === 'owner_protected') {
        return res.status(403).json({ error: 'The owner account is protected and cannot be deleted.' });
      }
      return res.status(404).json({ error: 'Administrator account was not found.' });
    }

    recordSecurityEvent(req, { event: 'admin.account.deleted', actorEmail: req.admin.email, actorRole: req.admin.role, targetEmail: email, targetRole: target.role, outcome: 'success', summary: 'Administrator account permanently deleted.' });
    return res.json({
      ok: true,
      message: 'Administrator account permanently deleted.',
      email: result.email
    });
  } catch (error) {
    console.error('Administrator deletion failed:', error.message);
    return res.status(503).json({ error: 'Unable to delete the administrator account right now.' });
  }
});

// Password reset email transport. The SMTP password must be an app password,
// never the user's normal Gmail/Google account password.
function createPasswordResetMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 465);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Password reset email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in server/.env.');
  }
  const secure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : port === 465;
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

// Forgot password works for active admins and registered customers. The
// response is intentionally identical whether or not an email exists.
app.post('/api/auth/forgot-password', passwordResetRequestLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  let mailer;
  try {
    mailer = createPasswordResetMailer();
  } catch (error) {
    console.error('Password reset mail configuration:', error.message);
    return res.status(503).json({ error: 'Password recovery email is not configured yet. Please contact the store administrator.' });
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const admin = await readAdminByEmail(email);
    const customer = admin ? null : await readUserByEmail(email);
    const accountType = admin ? 'admin' : customer ? 'customer' : null;
    const activeAccount = accountType === 'admin'
      ? Boolean(admin.active && ['owner', 'admin', 'manager'].includes(admin.role))
      : accountType === 'customer';

    if (activeAccount) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const requestedAt = new Date();
      const expiresAt = new Date(requestedAt.getTime() + 30 * 60_000).toISOString();
      const stored = await savePasswordResetToken({
        email,
        accountType,
        tokenHash,
        expiresAt,
        requestedAt: requestedAt.toISOString()
      });

      if (stored.saved) {
        const frontendOrigin = process.env.CLIENT_ORIGIN || [...allowedClientOrigins][0] || 'http://localhost:5173';
        const resetUrl = new URL('/', frontendOrigin);
        resetUrl.searchParams.set('resetToken', rawToken);
        resetUrl.searchParams.set('email', email);
        const from = process.env.SMTP_FROM || `NOVA Market <${process.env.SMTP_USER}>`;
        const safeUrl = escapeHtml(resetUrl.toString());

        try {
          await mailer.sendMail({
            from,
            to: email,
            subject: 'Reset your NOVA Market password',
            text: `We received a request to reset your NOVA Market password. This link expires in 30 minutes and can be used once:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;color:#211f1a;line-height:1.6;max-width:560px;margin:auto;padding:24px"><h1 style="font-family:Georgia,serif">NOVA<span style="color:#b58b43">.</span></h1><h2>Reset your password</h2><p>We received a request to reset your NOVA Market password.</p><p><a href="${safeUrl}" style="display:inline-block;background:#b58b43;color:#171715;text-decoration:none;padding:13px 22px;font-weight:bold">Reset password</a></p><p>This link expires in <b>30 minutes</b> and can only be used once.</p><p>If you did not request this, you can safely ignore this message.</p></div>`
          });
        } catch (mailError) {
          // Keep the response generic so SMTP/account existence is not exposed.
          console.error('Password reset email could not be sent:', mailError.message);
        }
      }
    }

    return res.json({
      ok: true,
      message: 'If an account exists for that email, a password reset link will be sent.'
    });
  } catch (error) {
    console.error('Password reset request failed:', error.message);
    return res.status(503).json({ error: 'Unable to process the password reset request right now.' });
  }
});

// Validate the one-time token, hash the new password and consume the token.
app.post('/api/auth/reset-password', passwordResetSubmitLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid reset link and a password of at least 15 characters.' });
  }

  try {
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
    const newPasswordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await consumePasswordResetToken({
      email: parsed.data.email.toLowerCase(),
      tokenHash,
      newPasswordHash,
      nowIso: new Date().toISOString()
    });

    if (!result.reset) {
      recordSecurityEvent(req, { event: 'auth.password_reset.failed', targetEmail: parsed.data.email.toLowerCase(), outcome: 'denied', summary: 'Invalid, expired or previously used reset token.' });
      return res.status(400).json({ error: 'This password reset link is invalid, expired, or has already been used. Request a new link.' });
    }

    recordSecurityEvent(req, { event: 'auth.password_reset.completed', actorEmail: parsed.data.email.toLowerCase(), actorRole: result.accountType, outcome: 'success', summary: 'Password reset completed; prior sessions revoked.' });
    return res.json({
      ok: true,
      message: 'Your password has been reset. You can now sign in with your new password.'
    });
  } catch (error) {
    console.error('Password reset failed:', error.message);
    return res.status(503).json({ error: 'Unable to reset your password right now.' });
  }
});

// First-time setup: the short-lived setup cookie is not an admin session.
app.post('/api/auth/mfa/setup/start', mfaVerifyLimiter, async (req, res) => {
  try {
    const admin = await getMfaChallengeAdmin(req, res, MFA_SETUP_COOKIE, 'setup');
    if (admin.mfaEnabled) return res.status(409).json({ error: 'Two-factor authentication is already enabled.' });
    getMfaEncryptionKey();
    let secret;
    if (admin.mfaSecretEncrypted) {
      secret = decryptMfaSecret(admin.mfaSecretEncrypted);
    } else {
      secret = generateTotpSecret();
      const saved = await savePendingAdminMfaSecret(admin.email, encryptMfaSecret(secret));
      if (!saved.saved) return res.status(409).json({ error: 'Unable to prepare authenticator setup. Please sign in again.' });
    }
    const label = encodeURIComponent(`NOVA Market:${admin.email}`);
    const issuer = encodeURIComponent('NOVA Market');
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    return res.json({ ok: true, email: admin.email, secret, otpauthUri, issuer: 'NOVA Market' });
  } catch (error) {
    console.error('MFA setup preparation failed:', error.message);
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Unable to prepare authenticator setup right now.' });
  }
});

app.post('/api/auth/mfa/setup/verify', mfaVerifyLimiter, async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success || !/^\d{6}$/.test(parsed.data?.code || '')) {
    return res.status(400).json({ error: 'Enter the six-digit code shown in your authenticator app.' });
  }
  try {
    const admin = await getMfaChallengeAdmin(req, res, MFA_SETUP_COOKIE, 'setup');
    if (admin.mfaEnabled) return res.status(409).json({ error: 'Two-factor authentication is already enabled.' });
    if (!admin.mfaSecretEncrypted) return res.status(400).json({ error: 'Authenticator setup has not been started. Please sign in again.' });
    const secret = decryptMfaSecret(admin.mfaSecretEncrypted);
    if (!verifyTotp(secret, parsed.data.code)) {
      recordSecurityEvent(req, { event: 'auth.mfa.enrollment_failed', actorEmail: admin.email, actorRole: admin.role, outcome: 'denied', summary: 'Invalid authenticator code during enrollment.' });
      return res.status(401).json({ error: 'That code is not valid. Check your authenticator app and try again.' });
    }

    const recoveryCodes = generateRecoveryCodes();
    const recoveryHashes = recoveryCodes.map(hashRecoveryCode);
    const enabled = await enableAdminMfaInSheet(admin.email, recoveryHashes);
    if (!enabled.enabled) {
      return res.status(409).json({ error: 'Two-factor setup could not be completed. Please sign in again.' });
    }
    const updatedAdmin = await readAdminByEmail(admin.email);
    if (!updatedAdmin || !updatedAdmin.mfaEnabled) throw new Error('Two-factor status could not be confirmed after setup.');

    clearMfaChallengeCookies(res);
    issueAdminSession(res, updatedAdmin);
    recordSecurityEvent(req, { event: 'auth.mfa.enrolled', actorEmail: updatedAdmin.email, actorRole: updatedAdmin.role, outcome: 'success', summary: 'Administrator authenticator enrollment completed.' });
    return res.json({ ...adminAccountPayload(updatedAdmin), recoveryCodes });
  } catch (error) {
    console.error('MFA enrollment verification failed:', error.message);
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Unable to complete authenticator setup right now.' });
  }
});

// Second factor for administrators who have already enrolled. A one-time recovery code is also accepted.
app.post('/api/auth/mfa/verify', mfaVerifyLimiter, async (req, res) => {
  const parsed = mfaCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your six-digit authenticator code or a backup code.' });
  try {
    const admin = await getMfaChallengeAdmin(req, res, MFA_CHALLENGE_COOKIE, 'verify');
    const mfaCooldown = await getSuspiciousAuthCooldown(req, admin.email, 'mfa');
    if (mfaCooldown.blocked) {
      res.set('Retry-After', String(mfaCooldown.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many verification failures. Please wait before trying again.' });
    }
    if (!admin.mfaEnabled || !admin.mfaSecretEncrypted) {
      return res.status(409).json({ error: 'Two-factor setup is incomplete. Sign in again to finish setup.' });
    }
    let verified = false;
    const suppliedCode = parsed.data.code.trim();
    if (/^\d{6}$/.test(suppliedCode)) {
      verified = verifyTotp(decryptMfaSecret(admin.mfaSecretEncrypted), suppliedCode);
    } else {
      const normalized = normalizeRecoveryCode(suppliedCode);
      if (normalized.length >= 16 && normalized.length <= 24) {
        const consumed = await consumeAdminMfaRecoveryHash(admin.email, hashRecoveryCode(normalized));
        verified = consumed.consumed;
      }
    }
    if (!verified) {
      recordSecurityEvent(req, { event: 'auth.mfa.failed', actorEmail: admin.email, actorRole: admin.role, outcome: 'denied', summary: 'Invalid authenticator or recovery code.' });
      const failureState = await recordSuspiciousAuthFailure(req, { identifier: admin.email, phase: 'mfa', targetRole: admin.role });
      if (failureState.blocked) {
        res.set('Retry-After', String(failureState.retryAfterSeconds));
        return res.status(429).json({ error: 'Too many verification failures. Please wait before trying again.' });
      }
      return res.status(401).json({ error: 'The authenticator or backup code is invalid or already used.' });
    }
    await clearSuspiciousAuthFailures(req, admin.email, 'mfa');
    clearMfaChallengeCookies(res);
    issueAdminSession(res, admin);
    recordSecurityEvent(req, { event: 'auth.login.succeeded', actorEmail: admin.email, actorRole: admin.role, outcome: 'success', summary: 'Administrator completed MFA and signed in.' });
    return res.json(adminAccountPayload(admin));
  } catch (error) {
    console.error('MFA sign-in verification failed:', error.message);
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Unable to verify the authenticator code right now.' });
  }
});

// Customer registration
app.post('/api/auth/register', registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Enter a valid name, email and password (minimum 8 characters).'
    });
  }

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  try {
    // Prevent registration using an existing admin email.
    const existingAdmin = await readAdminByEmail(email);

    if (existingAdmin) {
      return res.status(409).json({
        error: 'This email is already registered.'
      });
    }

    // Hash password before saving.
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await createCustomerInSheet({
      name,
      email,
      passwordHash
    });

    if (!result.created) {
      return res.status(409).json({
        error: 'This email is already registered.'
      });
    }

    recordSecurityEvent(req, { event: 'auth.customer.registered', actorEmail: email, actorRole: 'customer', outcome: 'success', summary: 'Customer account registered.' });
    return res.status(201).json({
      ok: true,
      message: 'Account created successfully. Please sign in.'
    });

  } catch (error) {
    console.error('Customer registration failed:', error.message);

    return res.status(503).json({
      error: 'Registration service is temporarily unavailable.'
    });
  }
});

// Unified admin/customer login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Enter a valid email and password.'
    });
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  let passwordCooldown;
  try {
    passwordCooldown = await getSuspiciousAuthCooldown(req, email, 'password');
  } catch (error) {
    console.error('Suspicious-login protection is unavailable:', error.message);
    return res.status(503).json({ error: 'Sign-in protection is temporarily unavailable. Please try again shortly.' });
  }
  if (passwordCooldown.blocked) {
    res.set('Retry-After', String(passwordCooldown.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many sign-in failures. Please wait before trying again.' });
  }

  try {
    // Admin accounts take precedence over customer accounts.
    const admin = await readAdminByEmail(email);
    const customer = admin ? null : await readUserByEmail(email);

    const account = admin || customer;

    const hashToCheck =
      account?.passwordHash || await dummyPasswordHashPromise;

    const passwordValid = await bcrypt.compare(
      password,
      hashToCheck
    );

    const isAdmin =
      Boolean(admin) &&
      admin.active &&
      ['owner', 'admin', 'manager'].includes(admin.role);

    const isCustomer = Boolean(customer);

    if (
      !account ||
      !passwordValid ||
      (!isAdmin && !isCustomer)
    ) {
      recordSecurityEvent(req, { event: 'auth.login.failed', targetEmail: email, outcome: 'denied', summary: 'Invalid credentials or inactive account.' });
      const failureState = await recordSuspiciousAuthFailure(req, { identifier: email, phase: 'password', targetRole: admin?.role || (customer ? 'customer' : '') });
      if (failureState.blocked) {
        res.set('Retry-After', String(failureState.retryAfterSeconds));
        return res.status(429).json({ error: 'Too many sign-in failures. Please wait before trying again.' });
      }
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    await clearSuspiciousAuthFailures(req, email, 'password');
    const accountType = isAdmin ? 'admin' : 'customer';

    if (isAdmin) {
      // All admin-workspace roles (owner, admin and manager) must complete MFA.
      getMfaEncryptionKey();
      res.clearCookie(COOKIE_NAME, cookieOptions);
      clearMfaChallengeCookies(res);
      if (admin.mfaEnabled && !admin.mfaSecretEncrypted) {
        throw new Error('MFA is marked enabled but its encrypted secret is missing. Owner recovery is required.');
      }
      if (admin.mfaEnabled) {
        recordSecurityEvent(req, { event: 'auth.admin.password_verified', actorEmail: admin.email, actorRole: admin.role, outcome: 'mfa_pending', summary: 'Password accepted; second factor required.' });
        setMfaChallengeCookie(res, MFA_CHALLENGE_COOKIE, admin, 'verify');
        return res.json({ ok: true, requiresMfa: true, accountType: 'admin' });
      }
      recordSecurityEvent(req, { event: 'auth.admin.password_verified', actorEmail: admin.email, actorRole: admin.role, outcome: 'mfa_setup_required', summary: 'Password accepted; authenticator enrollment required.' });
      setMfaChallengeCookie(res, MFA_SETUP_COOKIE, admin, 'setup');
      return res.json({ ok: true, requiresMfaSetup: true, accountType: 'admin' });
    }

    // Customer login remains password-only; MFA is required for admin-workspace accounts.
    clearMfaChallengeCookies(res);
    const now = Date.now();
    const token = jwt.sign(
      { sub: account.email, accountType, sessionVersion: Number(account.sessionVersion ?? 0), authTime: now, lastActivity: now },
      getJwtSecret(),
      { expiresIn: '8h', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_IDLE_TIMEOUT });
    recordSecurityEvent(req, { event: 'auth.login.succeeded', actorEmail: account.email, actorRole: 'customer', outcome: 'success', summary: 'Customer signed in.' });
    return res.json({
      ok: true, accountType, redirectTo: '/account',
      account: { email: account.email, fullName: customer.name, role: 'customer' }
    });

  } catch (error) {
    console.error('Unified login failed:', error.message);

    return res.status(503).json({
      error: 'Login service is temporarily unavailable.'
    });
  }
});

// Check current admin/customer session
app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    // Public visitors are expected to have no session. Return a normal
    // unauthenticated payload so the browser does not report a console error.
    return res.json({
      ok: false,
      authenticated: false
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(401).json({
      error: 'Session expired.'
    });
  }

  if (!isSessionWithinLimits(decoded)) {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    return res.status(401).json({ error: 'Your session expired after inactivity or reached its maximum lifetime. Please sign in again.' });
  }

  if (
    typeof decoded.sub !== 'string' ||
    !['admin', 'customer'].includes(decoded.accountType)
  ) {
    res.clearCookie(COOKIE_NAME, cookieOptions);

    return res.status(401).json({
      error: 'Invalid session.'
    });
  }

  try {
    if (decoded.accountType === 'admin') {
      if (decoded.mfaVerified !== true) {
        res.clearCookie(COOKIE_NAME, cookieOptions);
        return res.status(401).json({ error: 'Two-factor verification is required. Please sign in again.' });
      }
      const admin = await readAdminByEmail(decoded.sub);

      if (
        !admin ||
        !admin.active ||
        !['owner', 'admin', 'manager'].includes(admin.role)
      ) {
        res.clearCookie(COOKIE_NAME, cookieOptions);

        return res.status(401).json({
          error: 'Admin account unavailable.'
        });
      }
      if (!hasCurrentSessionVersion(decoded, admin)) {
        res.clearCookie(COOKIE_NAME, cookieOptions);
        return res.status(401).json({ error: 'Session revoked. Please sign in again.' });
      }

      refreshSessionCookie(res, decoded);
      return res.json({
        ok: true,
        accountType: 'admin',
        account: {
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role
        }
      });
    }

    const customer = await readUserByEmail(decoded.sub);

    if (!customer) {
      res.clearCookie(COOKIE_NAME, cookieOptions);

      return res.status(401).json({
        error: 'Customer account unavailable.'
      });
    }
    if (!hasCurrentSessionVersion(decoded, customer)) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ error: 'Session revoked. Please sign in again.' });
    }

    refreshSessionCookie(res, decoded);
    return res.json({
      ok: true,
      accountType: 'customer',
      account: {
        id: customer.id,
        email: customer.email,
        fullName: customer.name,
        role: 'customer'
      }
    });

  } catch (error) {
    console.error('Session verification failed:', error.message);

    return res.status(503).json({
      error: 'Session verification temporarily unavailable.'
    });
  }
});

// Logout revokes all sessions for this account by incrementing sessionVersion.
app.post('/api/auth/logout', async (req, res) => {
  const identity = getVerifiedSessionForAudit(req);
  try {
    const result = await revokeRequestSession(req, res);
    if (identity) recordSecurityEvent(req, { event: 'auth.logout', actorEmail: identity.email, actorRole: identity.role, outcome: 'success', summary: 'Account sessions revoked by logout.' });
    return res.json({
      ok: true,
      message: 'Signed out. Other active sessions for this account have also been revoked.',
      revoked: Boolean(result.revoked)
    });
  } catch (error) {
    console.error('Session revocation failed during logout:', error.message);
    return res.status(503).json({ ok: false, error: 'This browser was signed out, but other sessions could not be revoked. Please retry when the service is available.' });
  }
});

// Admin session check
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({
    ok: true,
    admin: req.admin
  });
});

// Legacy admin logout uses the same server-side account-wide revocation.
app.post('/api/admin/logout', async (req, res) => {
  try {
    const result = await revokeRequestSession(req, res);
    return res.json({ ok: true, message: 'Signed out and active sessions revoked.', revoked: Boolean(result.revoked) });
  } catch (error) {
    console.error('Admin session revocation failed:', error.message);
    return res.status(503).json({ ok: false, error: 'This browser was signed out, but other sessions could not be revoked.' });
  }
});

// General error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled request error:', err.message);

  res.status(500).json({
    error: 'Unexpected server error.'
  });
});

app.listen(port, () => {
  console.log(`NOVA Market API listening on port ${port} (${isProduction ? 'production' : 'development'} mode)`);
});