import { Mnemonic, PrivateKey, Address, NetworkType } from '../../wasm/kaspa/kaspa';
import { userSettings, Network } from './userSettings';
import { retryableRequest, handleNetworkError } from './networkUtils';
import { Logger } from './logger';
import { AppError } from './errorHandler';

export async function generateNewWallet(userId: string, network: Network): Promise<{ address: string; privateKey: string; mnemonic: string }> {
    Logger.info(`Generating new wallet for user: ${userId} on network: ${network}`);

    try {
        return await retryableRequest(async () => {
            const mnemonic = Mnemonic.random(24);
            Logger.info(`Mnemonic generated successfully`);

            const seed = mnemonic.toSeed();
            const validSeed = seed.length === 128 ? seed.slice(0, 64) : seed;
            if (validSeed.length !== 64) {
                throw new AppError('Invalid Seed', `Invalid seed length: ${validSeed.length}`, 'INVALID_SEED');
            }

            const privateKey = new PrivateKey(validSeed);
            const publicKey = privateKey.toPublicKey();

            const networkType = userSettings.getNetworkType(network);
            const address = publicKey.toAddress(networkType);

            userSettings.set(userId, {
                network,
                privateKey: privateKey.toString(),
                address: address.toString(),
                lastActivity: Date.now()
            });
            Logger.info(`User settings stored successfully`);

            return {
                address: address.toString(),
                privateKey: privateKey.toString(),
                mnemonic: mnemonic.toString()
            };
        }, 'Error generating new wallet');
    } catch (error) {
        throw handleNetworkError(error, 'generating new wallet');
    }
}