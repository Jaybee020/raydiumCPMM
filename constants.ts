import { Raydium, LiquidityPoolKeys } from "@raydium-io/raydium-sdk-v2";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

import { config } from "dotenv";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

config();

export const RAYDIUM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

export const tokenDetails = {
  name: "Example Token",
  symbol: "EXT",
  uri: "https://example.com/token-metadata.json",
  decimals: 9,
  supply: 1_000_000_000,
  description: "A sample token used for demonstration purposes.",
};

export const perpTokenConfig = {
  decimals: 9, // Decimals for the new PERP tokens
  supply: 1_000_000_000, // Initial and total supply of each PERP token (in whole units)
  description: "A sample token used for demonstration purposes.",
  image:
    "https://res.cloudinary.com/seyi-codes/image/upload/v1747102661/APbP7hYraQeMQ4y8apApy3zeeHCkNcd6_v1qvcj.png",
  twitter: "https://x.com/PerpRug",
  telegram: "https://t.me/PerpRug",
  website: "https://perprug.fun",
};

export const SOL_AMOUNT_TO_DEPOSIT_METEORA = 0.7;
export const PERP_TOKEN_DEPOSIT_PERCENTAGE = 0.1; // e.g., deposit 99% of the new PERP token
export const TOKENA_PROGRAM_ID = TOKEN_PROGRAM_ID;
export const TOKENB_PROGRAM_ID = TOKEN_PROGRAM_ID;

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
export const cluster = SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet";
export const rpcConnection = new Connection(SOLANA_RPC_URL, "confirmed");
const base58SecretKey = process.env.PRIVATE_KEY;
export const REDIS_URL = String(process.env.REDIS_URL);
let secretKey;
if (!base58SecretKey) {
  secretKey = [
    155, 155, 198, 61, 159, 253, 179, 138, 206, 173, 12, 65, 216, 12, 138, 80,
    198, 230, 229, 96, 154, 189, 21, 172, 124, 243, 223, 4, 131, 64, 209, 130,
    234, 151, 250, 200, 206, 179, 147, 169, 86, 52, 158, 181, 159, 246, 8, 192,
    208, 12, 166, 129, 34, 88, 7, 137, 134, 184, 232, 98, 102, 164, 158, 72,
  ];
} else {
  secretKey = bs58.decode(base58SecretKey);
}

export const keypair = {
  secretKey: secretKey,
};

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const SOL_DECIMALS = 9;

export const exportedKeyPair = Keypair.fromSecretKey(
  new Uint8Array(keypair.secretKey)
);
export const wallet = new NodeWallet(
  Keypair.fromSecretKey(new Uint8Array(keypair.secretKey))
);
export const publicKey = "Gnkp9MZSFAs6af6i6zYZJFHMb5RaezXZiKUBRKXTmqbM";

let raydium: Raydium | undefined;
export const initSdk = async (params?: {
  loadToken?: boolean;
  owner: PublicKey;
}) => {
  if (raydium) return raydium;
  if (rpcConnection.rpcEndpoint === rpcConnection.rpcEndpoint)
    console.warn(
      "using free rpc node might cause unexpected error, strongly suggest uses paid rpc node"
    );
  console.log(`connect to rpc ${rpcConnection.rpcEndpoint} in ${cluster}`);
  raydium = await Raydium.load({
    owner: params?.owner || wallet.payer,
    connection: rpcConnection,
    cluster,
    disableFeatureCheck: true,
    disableLoadToken: !params?.loadToken,
    blockhashCommitment: "finalized",
    // urlConfigs: {
    //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
    // },
  });
  return raydium;
};
