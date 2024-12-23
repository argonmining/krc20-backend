import { Collection } from 'discord.js';

interface RateLimitInfo {
  timestamp: number;
  count: number;
}

export class RateLimiter {
  private limits: Collection<string, RateLimitInfo>;
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number, timeWindow: number) {
    this.limits = new Collection();
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  check(key: string): boolean {
    const now = Date.now();
    const userLimit = this.limits.get(key);

    if (!userLimit) {
      this.limits.set(key, { timestamp: now, count: 1 });
      return true;
    }

    if (now - userLimit.timestamp > this.timeWindow) {
      this.limits.set(key, { timestamp: now, count: 1 });
      return true;
    }

    if (userLimit.count >= this.maxRequests) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  getRemainingTime(key: string): number {
    const userLimit = this.limits.get(key);
    if (!userLimit) return 0;

    const now = Date.now();
    const timePassed = now - userLimit.timestamp;
    return Math.max(0, this.timeWindow - timePassed);
  }
}

const globalRateLimiter = new RateLimiter(20, 60000); // 20 requests per minute
const actionRateLimiters = new Map<string, RateLimiter>();

actionRateLimiters.set('sendKaspa', new RateLimiter(5, 300000)); // 5 sends per 5 minutes
actionRateLimiters.set('checkBalance', new RateLimiter(20, 60000)); // 20 balance checks per minute
actionRateLimiters.set('walletCommand', new RateLimiter(5, 60000)); // 5 wallet commands per minute
actionRateLimiters.set('walletActions', new RateLimiter(20, 60000)); // 20 wallet actions per minute
actionRateLimiters.set('networkSelection', new RateLimiter(10, 60000)); // 10 network selections per minute
actionRateLimiters.set('importWallet', new RateLimiter(5, 60000)); // 5 wallet imports per minute
actionRateLimiters.set('showTransactionHistory', new RateLimiter(5, 60000)); // 5 transaction history requests per minute
actionRateLimiters.set('showHelpMessage', new RateLimiter(10, 60000)); // 10 help message requests per minute
actionRateLimiters.set('clearChatHistory', new RateLimiter(5, 300000)); // 1 chat history clear per 5 minutes

export function checkRateLimit(userId: string, action: string): boolean {
  const globalAllowed = globalRateLimiter.check(userId);
  if (!globalAllowed) return false;

  const actionLimiter = actionRateLimiters.get(action);
  if (actionLimiter) {
    return actionLimiter.check(userId);
  }

  return true;
}

export function getRateLimitRemainingTime(userId: string, action: string): number {
  const globalRemaining = globalRateLimiter.getRemainingTime(userId);
  const actionLimiter = actionRateLimiters.get(action);
  if (actionLimiter) {
    const actionRemaining = actionLimiter.getRemainingTime(userId);
    return Math.max(globalRemaining, actionRemaining);
  }
  return globalRemaining;
}