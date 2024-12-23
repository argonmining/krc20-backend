import { NetworkType } from '../../wasm/kaspa/kaspa';

export type Network = 'Mainnet' | 'Testnet-10' | 'Testnet-11';

export interface UserSession {
    network: Network;
    privateKey?: string;
    address?: string;
    lastActivity: number;
}

class UserSettings {
    private settings: Map<string, UserSession> = new Map();

    set(userId: string, session: UserSession): void {
        this.settings.set(userId, session);
    }

    get(userId: string): UserSession | undefined {
        return this.settings.get(userId);
    }

    delete(userId: string): boolean {
        return this.settings.delete(userId);
    }

    has(userId: string): boolean {
        return this.settings.has(userId);
    }

    getNetworkType(network: Network): NetworkType {
        switch (network) {
            case 'Mainnet':
                return NetworkType.Mainnet;
            case 'Testnet-10':
                return NetworkType.Testnet;
            case 'Testnet-11':
                return NetworkType.Testnet;
            default:
                throw new Error(`Invalid network: ${network}`);
        }
    }
}

export const userSettings = new UserSettings();