import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import { createRedisConnection } from './connection.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, type JobPayloads, type QueueName } from './queues.js';

export { QUEUE_NAMES, DEFAULT_JOB_OPTIONS, createRedisConnection };
export type { QueueName, JobPayloads };

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
