import { RpcClient, ScriptBuilder, Opcodes, PrivateKey, addressFromScriptPublicKey, createTransactions, kaspaToSompi } from "../../wasm/kaspa/kaspa";
import { Network } from './userSettings';
import { getRpcClient } from './rpcConnection';
import { Logger } from './logger';
import { AppError } from './errorHandler';

export const mintToken = async (userId: string, network: Network, ticker: string, priorityFeeValue: string, privateKeyString: string): Promise<string> => {
    Logger.info(`Starting token minting process for user: ${userId}`);

    try {
        const priorityFee = kaspaToSompi(priorityFeeValue);
        if (priorityFee === undefined) {
            throw new Error('Invalid priority fee value');
        }

        const RPC = await getRpcClient(userId, network);
        const privateKey = new PrivateKey(privateKeyString);
        const publicKey = privateKey.toPublicKey();
        const address = publicKey.toAddress(network);

        Logger.info(`Minting token ${ticker} for address: ${address.toString()}`);

        const data = { "p": "krc-20", "op": "mint", "tick": ticker };

        const script = new ScriptBuilder()
            .addData(publicKey.toXOnlyPublicKey().toString())
            .addOp(Opcodes.OpCheckSig)
            .addOp(Opcodes.OpFalse)
            .addOp(Opcodes.OpIf)
            .addData(Buffer.from("kasplex"))
            .addI64(0n)
            .addData(Buffer.from(JSON.stringify(data, null, 0)))
            .addOp(Opcodes.OpEndIf);

        const P2SHAddress = addressFromScriptPublicKey(script.createPayToScriptHashScript(), network)!;
        Logger.debug(`P2SH Address: ${P2SHAddress.toString()}`);

        const { entries } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
        const { transactions } = await createTransactions({
            priorityEntries: [],
            entries,
            outputs: [{
                address: P2SHAddress.toString(),
                amount: kaspaToSompi("0.3") ?? BigInt(30000000) // Fallback to 0.3 KAS if kaspaToSompi returns undefined
            }],
            changeAddress: address.toString(),
            priorityFee: kaspaToSompi("0.5") ?? BigInt(100000000), // Fallback to 1 KAS if kaspaToSompi returns undefined
            networkId: network
        });

        for (const transaction of transactions) {
            transaction.sign([privateKey]);
            Logger.debug(`Main: Transaction signed with ID: ${transaction.id}`);
            const commitHash = await transaction.submit(RPC);
            Logger.info(`Submitted P2SH commit transaction: ${commitHash}`);

            // Add a delay before attempting the reveal transaction
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay

            try {
                const { entries: newEntries } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
                const revealUTXOs = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress.toString()] });

                Logger.debug(`Reveal UTXOs: ${JSON.stringify(revealUTXOs)}`);

                if (!revealUTXOs.entries || revealUTXOs.entries.length === 0) {
                    Logger.error('No UTXOs found for reveal transaction');
                    throw new Error('No UTXOs found for reveal transaction');
                }

                const { transactions: revealTransactions } = await createTransactions({
                    priorityEntries: [revealUTXOs.entries[0]],
                    entries: newEntries,
                    outputs: [],
                    changeAddress: address.toString(),
                    priorityFee: kaspaToSompi("0.5") ?? BigInt(100000000), // Fallback to 1 KAS if kaspaToSompi returns undefined
                    networkId: network
                });

                for (const revealTx of revealTransactions) {
                    revealTx.sign([privateKey], false);
                    Logger.debug(`Reveal transaction signed with ID: ${revealTx.id}`);
                    const ourOutput = revealTx.transaction.inputs.findIndex((input) => input.signatureScript === '');

                    if (ourOutput !== -1) {
                        const signature = await revealTx.createInputSignature(ourOutput, privateKey);
                        revealTx.fillInput(ourOutput, script.encodePayToScriptHashSignatureScript(signature));
                    }

                    const revealHash = await revealTx.submit(RPC);
                    Logger.info(`Submitted reveal transaction: ${revealHash}`);

                    return revealHash;
                }
            } catch (revealError) {
                Logger.error(`Reveal transaction error: ${revealError}`);
                throw new Error(`Error during reveal transaction: ${revealError}`);
            }
        }

        // In case no transactions were processed
        return `No transactions were processed for minting ${ticker}`;

    } catch (error) {
        Logger.error(`Error during token minting: ${error}`);
        throw new AppError('Minting Error', `Error during token minting: ${error}`, 'MINTING_ERROR');
    }
};