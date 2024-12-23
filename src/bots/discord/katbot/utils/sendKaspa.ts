import { UtxoProcessor, UtxoContext, createTransactions, PrivateKey, Address } from "../../wasm/kaspa/kaspa";
import { getRpcClient } from './rpcConnection';
import { userSettings, Network, UserSession } from './userSettings';
import { retryableRequest, handleNetworkError } from './networkUtils';
import { Logger } from './logger';
import { AppError } from './errorHandler';

export const sendKaspa = async (userId: string, amount: bigint, destinationAddress: string, network: Network) => {
    const userSession = userSettings.get(userId);
    if (!userSession || !userSession.address || !userSession.privateKey) {
        throw new AppError('User Not Found', 'User wallet not found or incomplete wallet information', 'USER_NOT_FOUND');
    }

    if (typeof userSession.address !== 'string' || typeof userSession.privateKey !== 'string') {
        throw new AppError('Invalid Wallet Data', 'Invalid address or private key format', 'INVALID_WALLET_DATA');
    }

    try {
        return await retryableRequest(async () => {
            const rpc = await getRpcClient(userId, network);
            const processor = new UtxoProcessor({ rpc, networkId: network });
            const context = new UtxoContext({ processor });

            await new Promise<void>((resolve) => {
                const listener = async () => {
                    Logger.info(`UtxoProcessor initialized for user: ${userId}`);
                    await context.trackAddresses([userSession.address as string]);
                    processor.removeEventListener('utxo-proc-start', listener);
                    resolve();
                };
                processor.addEventListener('utxo-proc-start', listener);
                processor.start();
            });

            const userAddress = new Address(userSession.address as string);

            const { transactions, summary } = await createTransactions({
                entries: context,
                outputs: [{ address: new Address(destinationAddress), amount }],
                changeAddress: userAddress,
                priorityFee: 0n
            });

            if (transactions.length === 0) {
                throw new AppError('No Transaction Created', 'No transaction created', 'NO_TRANSACTION_CREATED');
            }

            const privateKey = new PrivateKey(userSession.privateKey as string);

            for (const transaction of transactions) {
                Logger.info(`Signing and submitting transaction: ${transaction.id}`);
                await transaction.sign([privateKey]);
                await transaction.submit(rpc);
                emitTransactionEvent(userId, transaction.id);
            }

            Logger.info(`All transactions sent successfully. Final ID: ${summary.finalTransactionId}`);
            return summary.finalTransactionId;
        }, 'Error sending Kaspa');
    } catch (error) {
        throw handleNetworkError(error, 'sending Kaspa');
    }
};

type TransactionEventListener = (userId: string, txId: string) => void;
const transactionEventListeners: TransactionEventListener[] = [];

export const addTransactionEventListener = (listener: TransactionEventListener) => {
    transactionEventListeners.push(listener);
};

const emitTransactionEvent = (userId: string, txId: string) => {
    transactionEventListeners.forEach(listener => listener(userId, txId));
};