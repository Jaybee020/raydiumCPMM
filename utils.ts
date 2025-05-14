import {
  CREATE_CPMM_POOL_PROGRAM,
  DEV_CREATE_CPMM_POOL_PROGRAM,
} from "@raydium-io/raydium-sdk-v2";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

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
): Promise<bigint> {
  try {
    const ata = getAssociatedTokenAddressSync(
      mintAddress,
      pubKey,
      allowOffCurve
    );
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    return BigInt(balance.value.uiAmount || 0);
  } catch (error) {
    // Account might not exist, which is fine
    return BigInt(0);
  }
}
