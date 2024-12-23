import axios, { AxiosError } from 'axios';
import { Logger } from './logger';
import { AppError } from './errorHandler';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export async function retryableRequest<T>(
  requestFn: () => Promise<T>,
  errorMessage: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt === maxRetries) {
        Logger.error(`${errorMessage} - Max retries reached`, { error });
        throw new AppError('Network Error', 'Unable to complete the request due to network issues. Please try again later.', 'NETWORK_ERROR');
      }

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNABORTED' || axiosError.response?.status === 429) {
          Logger.warn(`${errorMessage} - Retrying (${attempt}/${maxRetries})`, { error });
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
          continue;
        }
      }

      throw error;
    }
  }
  throw new AppError('Unexpected Error', 'An unexpected error occurred', 'UNEXPECTED_ERROR');
}

export function handleNetworkError(error: any, context: string): AppError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.code === 'ECONNABORTED') {
      return new AppError('Request Timeout', 'The request timed out. Please try again later.', 'REQUEST_TIMEOUT');
    }
    if (axiosError.response?.status === 429) {
      return new AppError('Rate Limit Exceeded', 'You\'ve exceeded the rate limit. Please try again later.', 'RATE_LIMIT_EXCEEDED');
    }
    if (axiosError.response?.status === 404) {
      return new AppError('Not Found', 'The requested resource was not found.', 'NOT_FOUND');
    }
    if (axiosError.response?.status === 500) {
      return new AppError('Server Error', 'An error occurred on the server. Please try again later.', 'SERVER_ERROR');
    }
  }
  return new AppError('Network Error', `An error occurred while ${context}. Please check your connection and try again.`, 'NETWORK_ERROR');
}