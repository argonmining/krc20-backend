import { ofetch } from 'ofetch';

// Define a constant for the base URL
const KASPA_API_BASE_URL = 'https://api.kaspa.org/api';

interface TransactionInput {
  transaction_id: string;
  index: number;
  previous_outpoint_hash: string;
  previous_outpoint_index: string;
  previous_outpoint_resolved: {
    transaction_id: string;
    index: number;
    amount: number;
    script_public_key: string;
    script_public_key_address: string;
    script_public_key_type: string;
    accepting_block_hash: string;
  };
  previous_outpoint_address: string;
  previous_outpoint_amount: number;
  signature_script: string;
  sig_op_count: string;
}

interface TransactionOutput {
  transaction_id: string;
  index: number;
  amount: number;
  script_public_key: string;
  script_public_key_address: string;
  script_public_key_type: string;
  accepting_block_hash: string;
}

interface TransactionData {
  subnetwork_id: string;
  transaction_id: string;
  hash: string;
  mass: string;
  block_hash: string[];
  block_time: number;
  is_accepted: boolean;
  accepting_block_hash: string;
  accepting_block_blue_score: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
}

async function getTransactionData(transactionHash: string): Promise<TransactionData> {
  try {
    const response = await ofetch<TransactionData>(`${KASPA_API_BASE_URL}/transactions/${transactionHash}`);
    return response;
  } catch (error) {
    console.error('Error fetching transaction data:', error);
    throw error;
  }
}

export { getTransactionData };
