import { WSOLMint } from "@raydium-io/raydium-sdk-v2";
import { exportedKeyPair, keypair, rpcConnection, SOL_MINT } from "./constants";
import { RaydiumClient } from "./services/blockchain/raydium/Raydium";
import { runBotMeteora, runBotRaydium } from "./services/jobs/raydiumcpm";
import { PublicKey } from "@solana/web3.js";
import { getSPLBalance } from "./utils";
import { derivePositionNftAccount } from "@meteora-ag/cp-amm-sdk";

(async function main() {
  // await runBotRaydium();
  const positionNftAccount = await rpcConnection.getTokenAccountsByOwner(
    exportedKeyPair.publicKey,
    { mint: new PublicKey("YfHMLheu1kXjVHnYo1vazvbBFUjm6GxEan8D1DdGXVf") }
  );

  console.log("positionNftAccount", positionNftAccount.value[0].pubkey);
  console.log(
    "derivedPositionNftAccount",
    derivePositionNftAccount(
      new PublicKey("YfHMLheu1kXjVHnYo1vazvbBFUjm6GxEan8D1DdGXVf")
    )
  );
  await runBotMeteora();
  // console.log(exportedKeyPair.publicKey.toString());
})();
