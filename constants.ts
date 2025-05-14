import { Raydium, LiquidityPoolKeys } from "@raydium-io/raydium-sdk-v2";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { clusterApiUrl, Connection, Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

import { config } from "dotenv";

config();

export const RAYDIUM_PROGRAM_ID = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
export const cluster = SOLANA_RPC_URL.includes("devnet") ? "devnet" : "mainnet";
export const rpcConnection = new Connection(SOLANA_RPC_URL, "confirmed");
export const keypair = {
  publicKey: [],
  secretKey: [],
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
