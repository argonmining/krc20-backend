import axios from 'axios';
import { Message } from 'telegraf/types';

export interface TokenInfo {
  tick: string;
  max: string;
  lim: string;
  pre: string;
  to: string;
  dec: string;
  minted: string;
  opScoreAdd: string;
  opScoreMod: string;
  state: string;
  hashRev: string;
  mtsAdd: string;
  holderTotal: string;
  transferTotal: string;
  mintTotal: string;
  holder: { address: string; amount: string }[];
}

export interface TokenBalance {
  tick: string;
  balance: string;
  dec: string;
}

export function isTextMessage(message: Message): message is Message.TextMessage {
  return 'text' in message;
}

export function formatNumber(num: string, decimals: number): string {
  const parsedNum = BigInt(num);
  const divisor = BigInt(10 ** decimals);
  const integerPart = parsedNum / divisor;
  const fractionalPart = parsedNum % divisor;

  let formattedNum = integerPart.toLocaleString('en-US');

  if (fractionalPart > 0) {
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractionalStr = fractionalStr.replace(/0+$/, '');
    if (trimmedFractionalStr.length > 0) {
      formattedNum += '.' + trimmedFractionalStr;
    }
  }

  return formattedNum;
}

export function formatNumberWithoutDecimals(num: string): string {
  return BigInt(num).toLocaleString('en-US');
}

export function calculatePercentage(part: bigint, whole: bigint): string {
  return ((Number(part) / Number(whole)) * 100).toFixed(2) + '%';
}

export async function fetchTokenInfo(ticker: string): Promise<TokenInfo> {
  const apiBaseUrl = process.env.MAINNET_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error('API base URL not found for Mainnet');
  }

  const url = `${apiBaseUrl}/token/${ticker}`;
  try {
    const response = await axios.get(url);
    return response.data.result[0];
  } catch (error) {
    console.error(`Failed to fetch token info: ${error}`);
    throw new Error('Failed to retrieve token information');
  }
}

export async function fetchKRC20Balances(address: string): Promise<TokenBalance[]> {
  const apiBaseUrl = process.env.MAINNET_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error('API base URL not found for Mainnet');
  }

  const url = `${apiBaseUrl}/address/${address}/tokenlist`;
  try {
    const response = await axios.get(url);
    return response.data.result;
  } catch (error) {
    console.error(`Failed to fetch KRC20 balances: ${error}`);
    throw new Error('Failed to retrieve KRC20 balances');
  }
}

export function formatBalance(balance: string, decimals: number): string {
  return formatNumber(balance, decimals);
}

// ... (keep other existing utility functions)
