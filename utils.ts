import {
  CREATE_CPMM_POOL_PROGRAM,
  DEV_CREATE_CPMM_POOL_PROGRAM,
} from "@raydium-io/raydium-sdk-v2";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { PinataSDK } from "pinata";
import { rpcConnection } from "./constants";

const VALID_PROGRAM_ID = new Set([
  CREATE_CPMM_POOL_PROGRAM.toBase58(),
  DEV_CREATE_CPMM_POOL_PROGRAM.toBase58(),
]);

export const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id);

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gets the token balance for an account
 * @param connection RPC connection
 * @param mintAddress The token mint address
 * @param pubKey The account public key
 * @param allowOffCurve Whether to allow off-curve addresses
 * @returns Token balance as bigint
 */
export async function getSPLBalance(
  connection: Connection,
  mintAddress: PublicKey,
  pubKey: PublicKey,
  allowOffCurve = false
) {
  try {
    console.log(mintAddress.toString(), pubKey.toString());
    const ata = getAssociatedTokenAddressSync(
      mintAddress,
      pubKey,
      allowOffCurve
    );
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    return balance.value.uiAmount;
  } catch (error) {
    console.error(error);
    // Account might not exist, which is fine
    return 0;
  }
}

export async function uploadMetadata(metadata: any) {
  try {
    const pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT!,
      pinataGateway: process.env.PINATA_GATEWAY!,
    });

    const upload = await pinata.upload.public.json(metadata);
    return `https://gateway.pinata.cloud/ipfs/${upload.cid}`;
  } catch (error) {
    console.error(error);
    return "";
  }
}

export async function getLatestBlockhash() {
  const blockhash = await rpcConnection.getLatestBlockhash();
  return blockhash.blockhash;
}
