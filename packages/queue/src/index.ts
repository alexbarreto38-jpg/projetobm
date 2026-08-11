import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import { createRedisConnection } from './connection.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, type JobPayloads, type QueueName } from './queues.js';

export { QUEUE_NAMES, DEFAULT_JOB_OPTIONS, createRedisConnection };
export type { QueueName, JobPayloads };
export {
  CircuitBreaker,
  InMemoryBreakerStore,
  RedisBreakerStore,
  type CircuitState,
  type BreakerStore,
  type BreakerRecord,
  type CircuitBreakerOptions,
} from './circuitBreaker.js';
export {
  RateLimiter,
  InMemoryRateStore,
  RedisRateStore,
  type RateStore,
  type TakeResult,
  type RateLimiterOptions,
} from './rateLimiter.js';

/** Cria uma fila tipada. */
export function createQueue<N extends QueueName>(
  name: N,
  connection: ConnectionOptions,
): Queue<JobPayloads[N]> {
  return new Queue<JobPayloads[N]>(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}

/** Cria um worker tipado para uma fila. */
export function createWorker<N extends QueueName>(
  name: N,
  processor: Processor<JobPayloads[N]>,
  connection: ConnectionOptions,
  concurrency = 5,
): Worker<JobPayloads[N]> {
  return new Worker<JobPayloads[N]>(name, processor, { connection, concurrency });
}

export { Queue, Worker };
export type { ConnectionOptions };

/**
 * Provedor de contagens por fila (para métricas). Cria uma Queue por nome e
 * expõe getCounts(); reutilize a mesma instância (não crie por scrape).
 */
export function createQueueCounters(connection: ConnectionOptions) {
  const queues = Object.values(QUEUE_NAMES).map((name) => ({
    name,
    queue: new Queue(name, { connection }),
  }));
  return {
    async getCounts(): Promise<Record<string, Record<string, number>>> {
      const out: Record<string, Record<string, number>> = {};
      await Promise.all(
        queues.map(async ({ name, queue }) => {
          out[name] = (await queue.getJobCounts()) as Record<string, number>;
        }),
      );
      return out;
    },
    async close(): Promise<void> {
      await Promise.all(queues.map(({ queue }) => queue.close()));
    },
  };
}
