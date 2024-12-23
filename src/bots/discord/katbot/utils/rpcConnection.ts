import { RpcClient, Encoding, Resolver, UtxoProcessor, UtxoContext } from "../../wasm/kaspa/kaspa";
import { Network } from './userSettings';
import { retryableRequest, handleNetworkError } from './networkUtils';
import { Logger } from './logger';
import { AppError } from './errorHandler';
import dotenv from 'dotenv';

dotenv.config();

const rpcClients: Map<string, RpcClient> = new Map();
const rpcConnections: Map<string, boolean> = new Map();
const utxoProcessors: Map<string, UtxoProcessor> = new Map();
const utxoContexts: Map<string, UtxoContext> = new Map();

const createRpcClient = (network: Network): RpcClient => {
    return new RpcClient({
        resolver: new Resolver({
            urls: ["https://us-east.nachowyborski.xyz", "https://us-west.nachowyborksi.xyz", "https://de.nachowyborksi.xyz", "https://turkey.nachowyborski.xyz", "https://brazil.nachowyborski.xyz", "https://italy.nachowyborski.xyz"]
        }),
        encoding: Encoding.Borsh,
        networkId: getNetworkId(network),
    });
};

const getNetworkId = (network: Network): string => {
    switch (network) {
        case 'Mainnet':
            return 'mainnet';
        case 'Testnet-10':
            return 'testnet-10';
        case 'Testnet-11':
            return 'testnet-11';
        default:
            throw new AppError('Invalid Network', `Invalid network: ${network}`, 'INVALID_NETWORK');
    }
};

export const getRpcClient = async (userId: string, network: Network): Promise<RpcClient> => {
    const clientKey = `${userId}-${network}`;
    Logger.info(`Getting RPC client for ${clientKey}`);
    
    try {
        return await retryableRequest(async () => {
            if (!rpcClients.has(clientKey)) {
                Logger.info(`Creating new RPC client for ${clientKey}`);
                rpcClients.set(clientKey, createRpcClient(network));
            }

            if (!rpcConnections.get(clientKey)) {
                Logger.info(`Connecting RPC client for ${clientKey}`);
                await connectRpc(clientKey);
            }

            const client = rpcClients.get(clientKey);
            if (!client) {
                throw new AppError('RPC Client Not Found', `RPC client not found for ${clientKey}`, 'RPC_CLIENT_NOT_FOUND');
            }

            Logger.info(`Returning RPC client for ${clientKey}`);
            return client;
        }, 'Error getting RPC client');
    } catch (error) {
        throw handleNetworkError(error, `getting RPC client for ${network}`);
    }
};

const connectRpc = async (clientKey: string): Promise<void> => {
    const rpc = rpcClients.get(clientKey);
    if (!rpc) {
        throw new AppError('RPC Client Not Initialized', 'RPC client not initialized', 'RPC_CLIENT_NOT_INITIALIZED');
    }

    try {
        await retryableRequest(async () => {
            Logger.info(`Attempting to connect RPC client for ${clientKey}`);
            await rpc.connect();
            Logger.info(`RPC client connected for ${clientKey}`);
            
            const serverInfo = await rpc.getServerInfo();
            Logger.info(`Retrieved server info for ${clientKey}:`, serverInfo);
            
            if (!serverInfo.isSynced || !serverInfo.hasUtxoIndex) {
                throw new AppError('Node Not Ready', 'Provided node is either not synchronized or lacks the UTXO index.', 'NODE_NOT_READY');
            }

            rpcConnections.set(clientKey, true);
            Logger.info(`RPC connection established for ${clientKey}`);
        }, 'Error connecting RPC');
    } catch (error) {
        rpcConnections.set(clientKey, false);
        throw handleNetworkError(error, `connecting RPC for ${clientKey}`);
    }
};

export const ensureRpcConnection = async (userId: string, network: Network): Promise<void> => {
    const clientKey = `${userId}-${network}`;
    if (!rpcConnections.get(clientKey)) {
        await connectRpc(clientKey);
    }
};

export const disconnectRpc = async (userId: string, network: Network): Promise<void> => {
    const clientKey = `${userId}-${network}`;
    const rpc = rpcClients.get(clientKey);
    if (rpc && rpcConnections.get(clientKey)) {
        await rpc.disconnect();
        rpcConnections.set(clientKey, false);
        Logger.info(`RPC connection closed for ${clientKey}`);
    }
};

export const getUtxoProcessor = async (userId: string, network: Network): Promise<UtxoProcessor> => {
    const clientKey = `${userId}-${network}`;
    try {
        return await retryableRequest(async () => {
            if (!utxoProcessors.has(clientKey)) {
                const rpc = await getRpcClient(userId, network);
                const processor = new UtxoProcessor({ rpc, networkId: getNetworkId(network) });
                utxoProcessors.set(clientKey, processor);
                processor.start();
            }
            return utxoProcessors.get(clientKey)!;
        }, 'Error getting UTXO processor');
    } catch (error) {
        throw handleNetworkError(error, `getting UTXO processor for ${network}`);
    }
};

export const getUtxoContext = async (userId: string, network: Network): Promise<UtxoContext> => {
    const clientKey = `${userId}-${network}`;
    try {
        return await retryableRequest(async () => {
            if (!utxoContexts.has(clientKey)) {
                const processor = await getUtxoProcessor(userId, network);
                const context = new UtxoContext({ processor });
                utxoContexts.set(clientKey, context);
            }
            return utxoContexts.get(clientKey)!;
        }, 'Error getting UTXO context');
    } catch (error) {
        throw handleNetworkError(error, `getting UTXO context for ${network}`);
    }
};

const listener = async (): Promise<void> => {
    // Add types for the event listener
};