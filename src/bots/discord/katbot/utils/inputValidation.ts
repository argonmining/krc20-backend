import { AppError } from './errorHandler';

export function validateAddress(address: string): boolean {
    // Updated regex to handle both mainnet and testnet addresses
    const kaspaAddressRegex = /^(kaspa|kaspatest):[a-zA-Z0-9]{61,63}$/;
    return kaspaAddressRegex.test(address);
}

export function validateAmount(amount: string): number {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !Number.isFinite(parsedAmount)) {
        throw new AppError('Invalid amount', 'Please enter a valid positive number for the amount.', 'INVALID_AMOUNT');
    }
    // Check for more than 8 decimal places
    if (amount.includes('.') && amount.split('.')[1].length > 8) {
        throw new AppError('Invalid amount', 'Kaspa only supports up to 8 decimal places.', 'INVALID_AMOUNT_PRECISION');
    }
    return parsedAmount;
}

export function sanitizeInput(input: string): string {
    // Remove any potentially harmful characters or scripts
    return input.replace(/[<>&'"]/g, '');
}

export function validatePrivateKey(privateKey: string): boolean {
    // Implement private key validation logic here
    // This is a placeholder implementation
    return privateKey.length === 64 && /^[0-9a-fA-F]+$/.test(privateKey);
}

export function validateNetwork(network: string): boolean {
    const validNetworks = ['Mainnet', 'Testnet-10', 'Testnet-11'];
    return validNetworks.includes(network);
}