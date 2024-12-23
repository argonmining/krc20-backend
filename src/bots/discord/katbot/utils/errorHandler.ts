import { TextBasedChannel } from 'discord.js';
import { Logger } from './logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public userMessage: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function handleError(
  error: unknown,
  channel: TextBasedChannel,
  context: string
): Promise<void> {
  if (error instanceof AppError) {
    Logger.error(`[${context}] ${error.message}`, { code: error.code });
    await channel.send(error.userMessage);
  } else if (error instanceof Error) {
    Logger.error(`[${context}] Unexpected error: ${error.message}`, { stack: error.stack });
    await channel.send('An unexpected error occurred. Please try again later.');
  } else {
    Logger.error(`[${context}] Unknown error`, { error });
    await channel.send('An unknown error occurred. Please try again later.');
  }
}