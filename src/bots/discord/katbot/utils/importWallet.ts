import { PrivateKey, Address, NetworkType } from '../../wasm/kaspa/kaspa';
import { userSettings, Network } from './userSettings';
import { retryableRequest, handleNetworkError } from './networkUtils';
import { Logger } from './logger';
import { AppError } from './errorHandler';

const getNetworkType = (network: Network): NetworkType => {
    switch (network) {
        case 'Mainnet':
            return NetworkType.Mainnet;
        case 'Testnet-10':
        case 'Testnet-11':
            return NetworkType.Testnet;
        default:
            throw new AppError('Invalid Network', `Invalid network: ${network}`, 'INVALID_NETWORK');
    }
};

export async function importWalletFromPrivateKey(privateKeyString: string, userId: string, network: Network = 'Mainnet'): Promise<{ address: string; privateKey: string }> {
    try {
        return await retryableRequest(async () => {
            const privateKey = new PrivateKey(privateKeyString);
            const address = privateKey.toAddress(getNetworkType(network));

            userSettings.set(userId, {
                network,
                privateKey: privateKey.toString(),
                address: address.toString(),
                lastActivity: Date.now()
            });

            return {
                address: address.toString(),
                privateKey: privateKey.toString()
            };
        }, 'Error importing wallet from private key');
    } catch (error) {
        throw handleNetworkError(error, 'importing wallet from private key');
    }
}