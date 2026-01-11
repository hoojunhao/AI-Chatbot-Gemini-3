import {
  parseGeminiError,
  isContextOverflow,
  isRetryableError,
  getRetryDelay,
  getRecoveryActions,
} from './errorService';
import { GeminiErrorType } from '../types';
import { describe, it, expect } from 'vitest';

describe('ErrorService', () => {
  describe('parseGeminiError', () => {
    it('detects context overflow from message', () => {
      const error = new Error('Request payload size exceeds the limit: context length exceeded');
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.CONTEXT_OVERFLOW);
      expect(parsed.retryable).toBe(false);
      expect(parsed.userMessage).toContain('too long');
    });

    it('detects rate limiting', () => {
      const error = { status: 429, message: 'RESOURCE_EXHAUSTED: quota exceeded' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.RATE_LIMITED);
      expect(parsed.retryable).toBe(true);
      expect(parsed.httpCode).toBe(429);
    });

    it('detects invalid API key', () => {
      const error = { status: 401, message: 'PERMISSION_DENIED: API key invalid' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.INVALID_API_KEY);
      expect(parsed.retryable).toBe(false);
    });

    it('detects safety blocks', () => {
      const error = { message: 'Response blocked due to SAFETY concerns' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.SAFETY_BLOCKED);
      expect(parsed.retryable).toBe(false);
    });

    it('detects model unavailable', () => {
      const error = { status: 503, message: 'Service unavailable' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.MODEL_UNAVAILABLE);
      expect(parsed.retryable).toBe(true);
    });

    it('detects network errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.NETWORK_ERROR);
      expect(parsed.retryable).toBe(true);
    });

    it('handles unknown errors', () => {
      const error = { message: 'Something completely unexpected' };
      const parsed = parseGeminiError(error);

      expect(parsed.type).toBe(GeminiErrorType.UNKNOWN);
      expect(parsed.userMessage).toBeTruthy();
      expect(parsed.suggestion).toBeTruthy();
    });
  });

  describe('isContextOverflow', () => {
    it('returns true for context overflow errors', () => {
      expect(isContextOverflow(new Error('context length exceeded'))).toBe(true);
      expect(isContextOverflow(new Error('too many tokens in request'))).toBe(true);
      expect(isContextOverflow(new Error('maximum context reached'))).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isContextOverflow(new Error('network timeout'))).toBe(false);
      expect(isContextOverflow(new Error('invalid API key'))).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('identifies retryable errors', () => {
      expect(isRetryableError({ status: 429 })).toBe(true); // Rate limit
      expect(isRetryableError({ status: 503 })).toBe(true); // Service unavailable
      expect(isRetryableError(new Error('network timeout'))).toBe(true); // Network
      expect(isRetryableError({ message: 'unknown error' })).toBe(true); // Unknown
    });

    it('identifies non-retryable errors', () => {
      expect(isRetryableError({ status: 401 })).toBe(false); // Invalid API key
      expect(isRetryableError(new Error('context overflow'))).toBe(false); // Context overflow
      expect(isRetryableError({ message: 'SAFETY blocked' })).toBe(false); // Safety
    });
  });

  describe('getRetryDelay', () => {
    it('increases delay with each attempt', () => {
      const delay0 = getRetryDelay(0);
      const delay1 = getRetryDelay(1);
      const delay2 = getRetryDelay(2);

      // Account for jitter - delays should generally increase
      expect(delay1).toBeGreaterThan(delay0 - 1000);
      expect(delay2).toBeGreaterThan(delay1 - 1000);
    });

    it('caps delay at maximum', () => {
      const delay10 = getRetryDelay(10);
      expect(delay10).toBeLessThanOrEqual(31000); // 30s max + 1s jitter
    });

    it('includes jitter to prevent thundering herd', () => {
      const delays = [getRetryDelay(1), getRetryDelay(1), getRetryDelay(1)];
      // Not all delays should be exactly the same due to random jitter
      const allSame = delays.every(d => d === delays[0]);
      expect(allSame).toBe(false);
    });
  });

  describe('getRecoveryActions', () => {
    it('returns correct actions for context overflow', () => {
      const actions = getRecoveryActions(GeminiErrorType.CONTEXT_OVERFLOW);
      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('new_chat');
      expect(actions[0].primary).toBe(true);
    });

    it('returns correct actions for rate limit', () => {
      const actions = getRecoveryActions(GeminiErrorType.RATE_LIMITED);
      expect(actions[0].action).toBe('wait');
      expect(actions[0].primary).toBe(true);
    });

    it('returns correct actions for invalid API key', () => {
      const actions = getRecoveryActions(GeminiErrorType.INVALID_API_KEY);
      expect(actions[0].action).toBe('check_settings');
    });
  });
});
