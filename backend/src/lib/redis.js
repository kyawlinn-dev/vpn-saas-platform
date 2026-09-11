import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client — REST-based, no persistent socket needed.
 * Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.
 *
 * Usage: import { redis } from "../lib/redis.js";
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
