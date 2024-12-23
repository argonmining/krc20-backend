import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, DMChannel, MessageComponentInteraction, ChannelType, TextBasedChannel, MessageCollector } from 'discord.js';
import { generateNewWallet } from '../utils/generateNewWallet';
import { importWalletFromPrivateKey } from '../utils/importWallet';
import { sendKaspa } from '../utils/sendKaspa';
import { getBalance } from '../utils/getBalance';
import { userSettings, Network } from '../utils/userSettings';
import { getRpcClient } from '../utils/rpcConnection';
import axios, { AxiosResponse } from 'axios';
import { EmbedBuilder } from '@discordjs/builders';
import lodash from 'lodash';
import { createButton } from '../utils/utils';
import { Logger } from '../utils/logger';
import { handleError, AppError } from '../utils/errorHandler';
import { checkRateLimit, getRateLimitRemainingTime } from '../utils/rateLimit';
import { validateAddress, validateAmount, sanitizeInput, validatePrivateKey, validateNetwork } from '../utils/inputValidation';
import { retryableRequest, handleNetworkError } from '../utils/networkUtils';
import { mintToken } from '../utils/mintToken';
import { Address } from '../../wasm/kaspa/kaspa'; // Make sure to import Address from the correct path
import { getTokenInfo } from '../utils/tokenInfo';

const { debounce } = lodash;

enum WalletState {
  IDLE,
  NETWORK_SELECTION,
  WALLET_OPTIONS,
  WALLET_ACTIONS,
  SENDING_KASPA,
  CHECKING_BALANCE,
  VIEWING_HISTORY,
  IMPORTING_WALLET
}

const userWalletStates = new Map<string, WalletState>();
let lastWalletActionsMessage: Message | null = null;

export const handleWalletCommand = async (message: Message) => {
    const userId = message.author.id;
    Logger.info(`Wallet command triggered by user: ${userId} in channel type: ${message.channel.type}`);

    let channel: DMChannel | TextBasedChannel;
    if (message.channel.type === ChannelType.DM) {
        channel = message.channel;
    } else {
        channel = await message.author.createDM();
        await message.reply("I've sent you a DM to start your wallet session!");
    }

    const currentState = userWalletStates.get(userId) || WalletState.IDLE;

    // Ignore messages if the user is in these states
    if ([WalletState.SENDING_KASPA, WalletState.IMPORTING_WALLET].includes(currentState)) {
        Logger.info(`Ignoring message for user ${userId} in state ${currentState}`);
        return;
    }

    try {
        const userSession = userSettings.get(userId);
        switch (currentState) {
            case WalletState.IDLE:
                await channel.send("Welcome to your private Kat Wallet Session. Let's start by choosing which Network you'll be using.");
                await promptNetworkSelection(channel, userId);
                break;
            case WalletState.NETWORK_SELECTION:
                await promptNetworkSelection(channel, userId);
                break;
            case WalletState.WALLET_OPTIONS:
                if (userSession && userSession.network) {
                    await promptWalletOptions(channel, userId, userSession.network);
                } else {
                    await promptNetworkSelection(channel, userId);
                }
                break;
            case WalletState.WALLET_ACTIONS:
                try {
                    const interaction = await message.awaitMessageComponent({
                        filter: i => i.user.id === userId,
                        time: 300000
                    });

                    await interaction.deferUpdate();

                    switch (interaction.customId) {
                        case 'send_kaspa':
                            await sendKaspaPrompt(channel, userId);
                            break;
                        case 'check_balance':
                            await checkBalance(channel, userId);
                            break;
                        case 'transaction_history':
                            await showTransactionHistory(channel, userId);
                            break;
                        case 'token_info':
                            await showTokenInfo(channel, userId);
                            break;
                        case 'help':
                            await showHelpMessage(channel, userId);
                            break;
                        case 'clear_chat':
                            await clearChatHistory(channel, userId);
                            break;
                        case 'back':
                            userWalletStates.set(userId, WalletState.NETWORK_SELECTION);
                            await promptNetworkSelection(channel, userId);
                            return;
                        case 'end_session':
                            await endSession(channel, userId);
                            return; // Exit the function without calling promptWalletActions again
                    }
                } catch (error) {
                    Logger.error(`Interaction failed for user ${userId}: ${error}`);
                    await channel.send('The interaction failed or timed out. Please try again.');
                }
                break;
            default:
                Logger.warn(`Unexpected state for user ${userId}: ${currentState}`);
                userWalletStates.set(userId, WalletState.IDLE);
                await promptNetworkSelection(channel, userId);
        }
    } catch (error) {
        await handleError(error, channel, 'handleWalletCommand');
    }
};

const promptNetworkSelection = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Starting network selection for user: ${userId}`);

    if (!checkRateLimit(userId, 'networkSelection')) {
        const remainingTime = getRateLimitRemainingTime(userId, 'networkSelection');
        throw new AppError(
            'Rate limit exceeded',
            `You're selecting networks too frequently. Please try again in ${Math.ceil(remainingTime / 1000)} seconds.`,
            'RATE_LIMIT_EXCEEDED'
        );
    }

    try {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Network Selection')
            .setDescription('Please select the network you want to use:');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                createButton('Mainnet', 'Mainnet', ButtonStyle.Primary),
                createButton('Testnet-10', 'Testnet-10', ButtonStyle.Secondary),
                createButton('Testnet-11', 'Testnet-11', ButtonStyle.Secondary)
            );

        const message = await channel.send({ embeds: [embed], components: [row] });

        const filter = (i: MessageComponentInteraction) => 
            ['Mainnet', 'Testnet-10', 'Testnet-11'].includes(i.customId) && i.user.id === userId;

        const interaction = await message.awaitMessageComponent({ filter, time: 300000 });
        await interaction.deferUpdate();

        const selectedNetwork = interaction.customId as Network;
        if (!validateNetwork(selectedNetwork)) {
            throw new AppError('Invalid network', 'Please select a valid network.', 'INVALID_NETWORK');
        }

        userSettings.set(userId, { network: selectedNetwork, lastActivity: Date.now() });

        Logger.info(`User ${userId} selected network: ${selectedNetwork}`);
        
        // Delete the network selection message
        await message.delete().catch(error => Logger.error(`Failed to delete network selection message: ${error}`));
        
        await channel.send(`You've selected ${selectedNetwork}. Let's set up your wallet.`);
        
        // Set the state to WALLET_OPTIONS after network selection
        userWalletStates.set(userId, WalletState.WALLET_OPTIONS);
        
        // Prompt for wallet options
        await promptWalletOptions(channel, userId, selectedNetwork);
    } catch (error) {
        await handleError(new AppError(
            `Error in network selection for user: ${userId}`,
            'Network selection timed out. Please use the !wallet command again to restart.',
            'NETWORK_SELECTION_TIMEOUT'
        ), channel, 'promptNetworkSelection');
        userWalletStates.delete(userId);
    }
};

const promptWalletOptions = async (channel: DMChannel | TextBasedChannel, userId: string, network: Network) => {
    Logger.info(`Prompting wallet options for user: ${userId}`);
    try {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Wallet Options')
            .setDescription('Please choose an option:');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                createButton('create', 'Create New Wallet', ButtonStyle.Primary),
                createButton('import', 'Import Existing Wallet', ButtonStyle.Secondary)
            );

        const message = await channel.send({ embeds: [embed], components: [row] });

        const filter = (i: MessageComponentInteraction) => 
            ['create', 'import'].includes(i.customId) && i.user.id === userId;

        const interaction = await message.awaitMessageComponent({ filter, time: 300000 });
        await interaction.deferUpdate();

        // Delete the wallet options message
        await message.delete().catch(error => Logger.error(`Failed to delete wallet options message: ${error}`));

        if (interaction.customId === 'create') {
            await createNewWallet(channel, userId, network);
        } else {
            await importExistingWallet(channel, userId, network);
        }
    } catch (error) {
        await handleError(error, channel, 'promptWalletOptions');
        userWalletStates.delete(userId);
    }
};

const createNewWallet = async (channel: DMChannel | TextBasedChannel, userId: string, network: Network) => {
    Logger.info(`Creating new wallet for user: ${userId}`);

    try {
        // Perform wallet creation without sending any messages
        const walletInfo = await generateNewWallet(userId, network);

        // Parse the mnemonic object to extract the phrase
        const mnemonicObject = JSON.parse(walletInfo.mnemonic);
        const seedPhrase = mnemonicObject.phrase;

        // Only after successful creation, send confirmation messages
        await channel.send('Your new wallet has been created. Please store this information securely:');
        await channel.send(`Address: ${walletInfo.address}`);
        await channel.send(`Private Key: ${walletInfo.privateKey}`);
        await channel.send(`Seed Phrase: ${seedPhrase}`);

        await channel.send(`
⚠️ WARNINGS: 
- Kat Wallet Bot does not store your private key or seed phrase! 
- Securely store either your private key or seed phrase, or both!
- Never share your private key or seed phrase with anyone!

For security, once you have a backup, you can delete the messages above by clicking "Clear Chat" in the menu below.`);

        // Set the state to WALLET_ACTIONS
        userWalletStates.set(userId, WalletState.WALLET_ACTIONS);

        // Prompt for wallet actions
        await promptWalletActions(channel, userId);
    } catch (error) {
        await handleError(new AppError(
            `Error creating wallet for user: ${userId}`,
            'An error occurred while creating your wallet. Please try again.',
            'WALLET_CREATION_ERROR'
        ), channel, 'createNewWallet');
        // If there's an error, set the state back to WALLET_OPTIONS
        userWalletStates.set(userId, WalletState.WALLET_OPTIONS);
        await promptWalletOptions(channel, userId, network);
    }
};

const importExistingWallet = async (channel: DMChannel | TextBasedChannel, userId: string, network: Network) => {
    Logger.info(`Importing wallet for user: ${userId}`);
    userWalletStates.set(userId, WalletState.IMPORTING_WALLET);

    try {
        await channel.send('Please enter your private key:');

        const privateKeyFilter = (m: Message) => m.author.id === userId && validatePrivateKey(m.content);
        const privateKeyResponse = await channel.awaitMessages({
            filter: privateKeyFilter,
            max: 1,
            time: 60000,
            errors: ['time']
        });

        const privateKey = sanitizeInput(privateKeyResponse.first()?.content || '');

        // Perform wallet import
        const walletInfo = await importWalletFromPrivateKey(privateKey, userId, network);

        // Send confirmation message
        await channel.send(`Your wallet has been imported successfully. Address: ${walletInfo.address}`);

        // Set the state to WALLET_ACTIONS after successful import
        userWalletStates.set(userId, WalletState.WALLET_ACTIONS);
        Logger.info(`State set to WALLET_ACTIONS for user: ${userId}`);

        // Prompt for wallet actions
        await promptWalletActions(channel, userId);
    } catch (error) {
        await handleError(error, channel, 'importExistingWallet');
        // If there's an error, set the state back to WALLET_OPTIONS
        userWalletStates.set(userId, WalletState.WALLET_OPTIONS);
        await promptWalletOptions(channel, userId, network);
    }
};

const promptWalletActions = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Prompting wallet actions for user: ${userId}`);
    userWalletStates.set(userId, WalletState.WALLET_ACTIONS);

    // Delete the previous Wallet Actions message if it exists
    if (lastWalletActionsMessage) {
        try {
            await lastWalletActionsMessage.delete();
        } catch (error) {
            Logger.warn(`Failed to delete previous Wallet Actions message: ${error}`);
        }
    }

    const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            createButton('check_balance', 'Check Balance', ButtonStyle.Primary),
            createButton('send_kaspa', 'Send Kaspa', ButtonStyle.Primary),
            createButton('receive_address', 'Receive Address', ButtonStyle.Primary),
            createButton('transaction_history', 'Transaction History', ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            createButton('token_info', 'Token Info', ButtonStyle.Secondary),
            createButton('send_token', 'Send Token', ButtonStyle.Secondary),
            createButton('mint_token', 'Mint Token', ButtonStyle.Secondary),
            createButton('deploy_token', 'Deploy Token', ButtonStyle.Secondary)
        );

    const row3 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            createButton('go_back', 'Go Back', ButtonStyle.Secondary),
            createButton('help_menu', 'Help Menu', ButtonStyle.Secondary),
            createButton('clear_chat', 'Clear Chat', ButtonStyle.Danger),
            createButton('end_session', 'End Session', ButtonStyle.Danger)
        );

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Wallet Actions')
        .setDescription('What would you like to do?');

    const message = await channel.send({ embeds: [embed], components: [row1, row2, row3] });
    lastWalletActionsMessage = message;

    const collector = message.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 300000
    });

    collector.on('collect', async (interaction) => {
        try {
            await interaction.deferUpdate();

            switch (interaction.customId) {
                case 'check_balance':
                    await checkBalance(channel, userId);
                    break;
                case 'send_kaspa':
                    await sendKaspaPrompt(channel, userId);
                    break;
                case 'receive_address':
                    await showReceiveAddress(channel, userId);
                    break;
                case 'transaction_history':
                    await showTransactionHistory(channel, userId);
                    break;
                case 'token_info':
                    await showTokenInfo(channel, userId);
                    break;
                case 'send_token':
                    await sendTokenPrompt(channel, userId);
                    break;
                case 'mint_token':
                    await mintTokenPrompt(channel, userId);
                    break;
                case 'deploy_token':
                    await deployTokenPrompt(channel, userId);
                    break;
                case 'go_back':
                    userWalletStates.set(userId, WalletState.NETWORK_SELECTION);
                    await promptNetworkSelection(channel, userId);
                    collector.stop();
                    return;
                case 'help_menu':
                    await showHelpMessage(channel, userId);
                    break;
                case 'clear_chat':
                    await clearChatHistory(channel, userId);
                    break;
                case 'end_session':
                    await endSession(channel, userId);
                    collector.stop();
                    return;
            }

            // Prompt wallet actions again after each action
            await promptWalletActions(channel, userId);
        } catch (error) {
            Logger.error(`Error handling interaction for user ${userId}: ${error}`);
            await channel.send('An error occurred while processing your request. Please try again.');
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await channel.send('The wallet session has timed out due to inactivity. Please use the !wallet command to start a new session.');
            userWalletStates.delete(userId);
        }
    });
};

const sendKaspaPrompt = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Starting send Kaspa prompt for user: ${userId}`);
    userWalletStates.set(userId, WalletState.SENDING_KASPA);

    try {
        // Retrieve user's network
        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.network) {
            throw new AppError('Invalid Session', 'Your wallet session is invalid. Please start over with the !wallet command.', 'INVALID_SESSION');
        }
        const network = userSession.network;

        // Ask for recipient address
        await channel.send('Please enter the recipient\'s Kaspa address:');
        const addressResponse = await channel.awaitMessages({
            filter: (m: Message) => m.author.id === userId,
            max: 1,
            time: 60000,
            errors: ['time']
        });
        const recipientAddress = sanitizeInput(addressResponse.first()?.content || '');

        if (!validateAddress(recipientAddress)) {
            throw new AppError('Invalid Address', 'The recipient address you entered is invalid.', 'INVALID_ADDRESS');
        }

        // Ask for amount
        await channel.send('Please enter the amount of KAS to send:');
        const amountResponse = await channel.awaitMessages({
            filter: (m: Message) => m.author.id === userId,
            max: 1,
            time: 60000,
            errors: ['time']
        });
        const amount = sanitizeInput(amountResponse.first()?.content || '');

        if (!validateAmount(amount)) {
            throw new AppError('Invalid Amount', 'The amount you entered is invalid.', 'INVALID_AMOUNT');
        }

        // Confirm transaction
        const confirmEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Confirm Transaction')
            .setDescription('Please confirm the transaction details:')
            .addFields(
                { name: 'Amount', value: `${amount} KAS` },
                { name: 'Recipient Address', value: recipientAddress }
            );

        const confirmRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                createButton('confirm_send', 'Confirm', ButtonStyle.Success),
                createButton('cancel_send', 'Cancel', ButtonStyle.Danger)
            );

        const confirmMessage = await channel.send({ embeds: [confirmEmbed], components: [confirmRow] });

        try {
            const confirmation = await confirmMessage.awaitMessageComponent({
                filter: (i: MessageComponentInteraction) => i.user.id === userId && ['confirm_send', 'cancel_send'].includes(i.customId),
                time: 60000
            });

            await confirmation.deferUpdate();

            // Delete the confirmation message
            await confirmMessage.delete().catch(error => Logger.error(`Failed to delete confirmation message: ${error}`));

            if (confirmation.customId === 'confirm_send') {
                // Perform the transaction
                const txId = await sendKaspa(userId, BigInt(parseFloat(amount) * 1e8), recipientAddress, network);
                
                let explorerUrl;
                switch (network) {
                    case 'Mainnet':
                        explorerUrl = `https://explorer.kaspa.org/txs/${txId}`;
                        break;
                    case 'Testnet-10':
                        explorerUrl = `https://explorer-tn10.kaspa.org/txs/${txId}`;
                        break;
                    case 'Testnet-11':
                        explorerUrl = `https://explorer-tn11.kaspa.org/txs/${txId}`;
                        break;
                    default:
                        explorerUrl = `Transaction ID: ${txId}`;
                }

                await channel.send(`Transaction completed successfully! View on Explorer here: ${explorerUrl}`);
            } else {
                await channel.send('Transaction cancelled.');
            }
        } catch (interactionError) {
            Logger.error(`Interaction failed for user ${userId}: ${interactionError}`);
            await channel.send('The confirmation interaction failed or timed out. Please try the transaction again.');
        }

    } catch (error) {
        await handleError(error, channel, 'sendKaspaPrompt');
    } finally {
        // Reset the state to WALLET_ACTIONS
        userWalletStates.set(userId, WalletState.WALLET_ACTIONS);
    }
};

const checkBalance = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Checking balance for user: ${userId}`);
    try {
        if (!checkRateLimit(userId, 'checkBalance')) {
            const remainingTime = getRateLimitRemainingTime(userId, 'checkBalance');
            throw new AppError(
                'Rate limit exceeded',
                `You're checking balance too frequently. Please try again in ${Math.ceil(remainingTime / 1000)} seconds.`,
                'RATE_LIMIT_EXCEEDED'
            );
        }

        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.address) {
            throw new AppError('Invalid wallet', 'Your wallet is not set up correctly. Please create a new wallet.', 'INVALID_WALLET');
        }

        const { kaspaBalance, krc20Balances } = await getBalance(userId, userSession.network);

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Wallet Balance')
            .setDescription(`Balance for ${userSession.address}`)
            .addFields(
                { name: 'Kaspa Balance', value: kaspaBalance },
                { name: 'KRC20 Token Balances', value: krc20Balances.length > 0 ? 
                    krc20Balances.map(({ ticker, balance }) => `${ticker}: ${balance}`).join('\n') : 
                    'No KRC20 tokens' }
            )
            .setFooter({ text: `Network: ${userSession.network}` });

        await channel.send({ embeds: [embed] });
        Logger.info(`Balance message sent to user: ${userId}`);
    } catch (error) {
        await handleError(error, channel, 'checkBalance');
    }
};

const showTransactionHistory = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Showing transaction history for user: ${userId}`);
    try {
        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.address || !userSession.network) {
            throw new AppError('Invalid wallet', 'Your wallet session is invalid. Please start over with the !wallet command.', 'INVALID_SESSION');
        }

        const explorerUrl = getExplorerUrl(userSession.address, userSession.network);
        
        await channel.send(`Built in transaction history is coming soon. For now, you can view your transaction history here: ${explorerUrl}`);
        
        Logger.info(`Transaction history link sent to user: ${userId}`);

        // Delete the old Wallet Actions prompt
        if (lastWalletActionsMessage) {
            await lastWalletActionsMessage.delete().catch(error => Logger.error(`Failed to delete old Wallet Actions message: ${error}`));
        }

        // Issue a new Wallet Actions prompt
        await promptWalletActions(channel, userId);
    } catch (error) {
        await handleError(error, channel, 'showTransactionHistory');
    }
};

const getExplorerUrl = (address: string, network: Network): string => {
    switch (network) {
        case 'Mainnet':
            return `https://explorer.kaspa.org/addresses/${address}`;
        case 'Testnet-10':
            return `https://explorer-tn10.kaspa.org/addresses/${address}`;
        case 'Testnet-11':
            return `https://explorer-tn11.kaspa.org/addresses/${address}`;
        default:
            throw new AppError('Invalid Network', `Invalid network: ${network}`, 'INVALID_NETWORK');
    }
};

const showHelpMessage = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Showing help message for user: ${userId}`);
    try {
        if (!checkRateLimit(userId, 'showHelpMessage')) {
            const remainingTime = getRateLimitRemainingTime(userId, 'showHelpMessage');
            throw new AppError(
                'Rate limit exceeded',
                `You're requesting help messages too frequently. Please try again in ${Math.ceil(remainingTime / 1000)} seconds.`,
                'RATE_LIMIT_EXCEEDED'
            );
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Wallet Help')
            .setDescription('Here are the available wallet commands:')
            .addFields(
                { name: 'Send Kaspa', value: 'Send Kaspa to another address' },
                { name: 'Check Balance', value: 'View your current Kaspa and KRC20 token balances' },
                { name: 'Transaction History', value: 'View your recent transactions' },
                { name: 'Go Back', value: 'Return to the main wallet menu' }
            )
            .setFooter({ text: 'For more help, visit our documentation or contact support.' });

        await channel.send({ embeds: [embed] });
        Logger.info(`Help message sent to user: ${userId}`);
    } catch (error) {
        await handleError(error, channel, 'showHelpMessage');
    }
};

const clearChatHistory = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Clearing chat history for user: ${userId}`);

    try {
        if (!checkRateLimit(userId, 'clearChatHistory')) {
            const remainingTime = getRateLimitRemainingTime(userId, 'clearChatHistory');
            throw new AppError(
                'Rate limit exceeded',
                `You're clearing chat history too frequently. Please try again in ${Math.ceil(remainingTime / 1000)} seconds.`,
                'RATE_LIMIT_EXCEEDED'
            );
        }

        if (channel.type === ChannelType.DM) {
            const messages = await channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(m => m.author.id === channel.client.user.id);

            for (const message of botMessages.values()) {
                await message.delete();
            }

            await channel.send('Bot messages have been cleared. For security, please manually delete any of your messages containing sensitive information.');
            Logger.info(`Chat history cleared for user: ${userId}`);
        } else {
            throw new AppError('Invalid Channel', 'Chat history can only be cleared in DM channels.', 'INVALID_CHANNEL_TYPE');
        }
    } catch (error) {
        await handleError(error, channel, 'clearChatHistory');
    }
};

const endSession = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Ending session for user: ${userId}`);

    try {
        // Clear the chat
        await clearChatHistory(channel, userId);

        // Send the end session message
        await channel.send("Your session has now ended and all private information has been erased. Thank you for using Kat Wallet Bot by Nacho!");

        // Clear user session data
        userSettings.delete(userId);
        userWalletStates.delete(userId);

        Logger.info(`Session ended for user: ${userId}`);
    } catch (error) {
        await handleError(error, channel, 'endSession');
    }
};

const showReceiveAddress = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Showing receive address for user: ${userId}`);
    try {
        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.address) {
            throw new AppError('Invalid wallet', 'Your wallet is not set up correctly. Please create a new wallet.', 'INVALID_WALLET');
        }

        await channel.send(`Your receive address is: ${userSession.address}`);
        Logger.info(`Receive address sent to user: ${userId}`);
    } catch (error) {
        await handleError(error, channel, 'showReceiveAddress');
    }
};

const showTokenInfo = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Showing token info for user: ${userId}`);
    try {
        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.network) {
            throw new AppError('Invalid Session', 'Your wallet session is invalid. Please start over with the !wallet command.', 'INVALID_SESSION');
        }

        // Delete the old Wallet Actions prompt
        if (lastWalletActionsMessage) {
            await lastWalletActionsMessage.delete().catch(error => Logger.error(`Failed to delete old Wallet Actions message: ${error}`));
        }

        await channel.send('Please enter the ticker of the token you want to view information for:');
        const tickerResponse = await channel.awaitMessages({
            filter: (m: Message) => m.author.id === userId,
            max: 1,
            time: 60000,
            errors: ['time']
        });
        const ticker = tickerResponse.first()?.content.trim().toUpperCase();

        if (!ticker) {
            throw new AppError('Invalid Input', 'You must provide a valid ticker.', 'INVALID_INPUT');
        }

        const tokenInfoEmbed = await getTokenInfo(ticker);
        await channel.send({ embeds: [tokenInfoEmbed] });
    } catch (error) {
        await handleError(error, channel, 'showTokenInfo');
    } finally {
        userWalletStates.set(userId, WalletState.WALLET_ACTIONS);
        await promptWalletActions(channel, userId);
    }
};

const sendTokenPrompt = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Starting send token prompt for user: ${userId}`);
    await channel.send('Send token feature is coming soon!');
};

const mintTokenPrompt = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Starting mint token prompt for user: ${userId}`);
    
    try {
        const userSession = userSettings.get(userId);
        if (!userSession || !userSession.network || !userSession.privateKey || !userSession.address) {
            throw new AppError('Invalid Session', 'Your wallet session is invalid. Please start over with the !wallet command.', 'INVALID_SESSION');
        }

        await channel.send('Please enter the ticker of the token you want to mint:');
        const tickerResponse = await channel.awaitMessages({
            filter: (m: Message) => m.author.id === userId,
            max: 1,
            time: 60000,
            errors: ['time']
        });
        const ticker = tickerResponse.first()?.content.trim().toUpperCase();

        await channel.send('Please enter the priority fee (in KAS) for this transaction:');
        const feeResponse = await channel.awaitMessages({
            filter: (m: Message) => {
                try {
                    validateAmount(m.content);
                    return m.author.id === userId;
                } catch {
                    return false;
                }
            },
            max: 1,
            time: 60000,
            errors: ['time']
        });
        const priorityFee = feeResponse.first()?.content.trim();

        if (!ticker || !priorityFee) {
            throw new AppError('Invalid Input', 'You must provide both a ticker and a priority fee.', 'INVALID_INPUT');
        }

        const mintingMessage = await channel.send(`Initiating minting process for ${ticker} tokens. This may take a few minutes...`);

        try {
            const revealHash = await mintToken(userId, userSession.network, ticker, priorityFee, userSession.privateKey);
            
            const explorerUrl = `https://explorer-tn10.kaspa.org/txs/${revealHash}`;
            await mintingMessage.edit(`✅ Token minting successful for ${ticker}!\nReveal transaction hash: ${revealHash}\nYou can view the transaction details here: ${explorerUrl}`);

            // Optionally, you can add a balance check here to show the user their updated token balance
            await checkBalance(channel, userId);

        } catch (mintingError) {
            Logger.error(`Minting error for user ${userId}: ${mintingError}`);
            if (mintingError instanceof AppError) {
                await mintingMessage.edit(`❌ Error during token minting: ${mintingError.message}\nError code: ${mintingError.code}\nPlease try again or contact support if the issue persists.`);
            } else {
                await mintingMessage.edit(`❌ An unexpected error occurred during token minting. Please try again or contact support if the issue persists.`);
            }
        }

    } catch (error) {
        await handleError(error, channel, 'mintTokenPrompt');
    } finally {
        // Reset the state to WALLET_ACTIONS
        userWalletStates.set(userId, WalletState.WALLET_ACTIONS);
        await promptWalletActions(channel, userId);
    }
};

const deployTokenPrompt = async (channel: DMChannel | TextBasedChannel, userId: string) => {
    Logger.info(`Starting deploy token prompt for user: ${userId}`);
    await channel.send('Deploy token feature is coming soon!');
};