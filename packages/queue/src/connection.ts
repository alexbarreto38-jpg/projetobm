import { Redis, type RedisOptions } from 'ioredis';

/**
 * Conexão Redis compartilhada para BullMQ. BullMQ exige
 * maxRetriesPerRequest: null em conexões usadas por Workers.
 */
export function createRedisConnection(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    ...options,
  });
}
