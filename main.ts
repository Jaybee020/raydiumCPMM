import { WSOLMint } from "@raydium-io/raydium-sdk-v2";
import { exportedKeyPair, keypair, rpcConnection, SOL_MINT } from "./constants";
import { RaydiumClient } from "./services/blockchain/raydium/Raydium";
import {
  runBotMeteora,
  runBotRaydium,
  txQueue,
} from "./services/jobs/raydiumcpm";
import { PublicKey } from "@solana/web3.js";
import { getSPLBalance } from "./utils";

(async function main() {
  // await runBotRaydium();
  // await runBotMeteora();
})();
