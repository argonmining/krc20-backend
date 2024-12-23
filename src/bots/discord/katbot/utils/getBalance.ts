import { Address, NetworkType, sompiToKaspaStringWithSuffix } from '../../wasm/kaspa/kaspa';
import { getRpcClient } from './rpcConnection';
import { userSettings, Network } from './userSettings';
import { retryableRequest, handleNetworkError } from './networkUtils';
import { Logger } from './logger';
import { AppError } from './errorHandler';
import axios from 'axios';

interface BalanceResult {
    kaspaBalance: string;
    krc20Balances: { ticker: string; balance: string }[];
}

interface KRC20Balance {
    tick: string;
    balance: string;
    locked: string;
    dec: string;
    opScoreMod: string;
}

function getEnvNetworkName(network: Network): string {
    return network.replace('-', '_').toUpperCase();
}

function formatKRC20Balance(balance: string, decimals: string): string {
    const balanceNum = BigInt(balance);
    const divisor = BigInt(10 ** parseInt(decimals, 10));
    const integerPart = balanceNum / divisor;
    const fractionalPart = balanceNum % divisor;
    
    // Format integer part with commas
    let formattedBalance = integerPart.toLocaleString('en-US');

    // Add fractional part if it's not zero
    if (fractionalPart > 0) {
        const fractionalStr = fractionalPart.toString().padStart(parseInt(decimals, 10), '0');
        const trimmedFractionalStr = fractionalStr.replace(/0+$/, ''); // Remove trailing zeros
        if (trimmedFractionalStr.length > 0) {
            formattedBalance += '.' + trimmedFractionalStr;
        }
    }

    return formattedBalance;
}

async function fetchKRC20Balances(address: string, network: Network): Promise<{ ticker: string; balance: string }[]> {
    const envNetworkName = getEnvNetworkName(network);
    const apiBaseUrl = process.env[`${envNetworkName}_API_BASE_URL`];
    if (!apiBaseUrl) {
        Logger.warn(`API base URL not found for network: ${network}`);
        return [];
    }

    const url = `${apiBaseUrl}/address/${address}/tokenlist`;
    Logger.info(`Fetching KRC20 balances from: ${url}`);

    try {
        const response = await axios.get(url);
        Logger.info(`KRC20 balance response: ${JSON.stringify(response.data)}`);
        const balances: KRC20Balance[] = response.data.result || [];
        return balances.map(balance => ({
            ticker: balance.tick.toUpperCase(),
            balance: formatKRC20Balance(balance.balance, balance.dec)
        }));
    } catch (error) {
        if (axios.isAxiosError(error)) {
            Logger.error(`Failed to retrieve KRC20 balances: ${error.message}`);
            Logger.error(`Error response: ${JSON.stringify(error.response?.data)}`);
        } else {
            Logger.error(`Failed to retrieve KRC20 balances: ${error}`);
        }
        return [];
    }
}

export async function getBalance(userId: string, network: Network): Promise<BalanceResult> {
    Logger.info(`Fetching balance for user: ${userId}`);

    const userSession = userSettings.get(userId);
    if (!userSession || !userSession.address) {
        throw new AppError('User Not Found', 'User wallet not found or address is missing', 'USER_NOT_FOUND');
    }

    try {
        return await retryableRequest(async () => {
            const rpc = await getRpcClient(userId, network);
            const address = new Address(userSession.address as string);
            const balanceResponse = await rpc.getBalanceByAddress({ address: address.toString() });
            
            if (!balanceResponse) {
                throw new AppError('Balance Retrieval Failed', 'Failed to retrieve balance', 'BALANCE_RETRIEVAL_FAILED');
            }

            const networkType = NetworkType[userSession.network as keyof typeof NetworkType];
            const kaspaBalance = sompiToKaspaStringWithSuffix(balanceResponse.balance, networkType);

            // Fetch KRC20 balances
            let krc20Balances: { ticker: string; balance: string }[] = [];
            try {
                const krc20BalancesRaw = await fetchKRC20Balances(address.toString(), network);
                krc20Balances = krc20BalancesRaw.map(({ ticker, balance }) => ({ ticker: ticker.toUpperCase(), balance }));
            } catch (error) {
                Logger.error(`Failed to fetch KRC20 balances: ${error}`);
                // Continue with empty KRC20 balances
            }

            Logger.info(`Balance fetched successfully for user: ${userId}: ${kaspaBalance}`);
            return { kaspaBalance, krc20Balances };
        }, 'Error fetching balance');
    } catch (error) {
        throw handleNetworkError(error, 'fetching balance');
    }
}