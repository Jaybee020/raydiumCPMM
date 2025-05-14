import { WSOLMint } from "@raydium-io/raydium-sdk-v2";
import { keypair, rpcConnection, SOL_MINT } from "./constants";
import { RaydiumClient } from "./services/blockchain/raydium/Raydium";
import { runBot, txQueue } from "./services/jobs/raydiumcpm";

(async function main() {
  await runBot();

  // //Step 1: Create Token
  // const tokenInfo = {
  //   name: "Jaybee",
  //   symbol: "JayB",
  //   uri: "",
  //   //     decimals: 6,
  //   //     supply:1000000_00000000
  // };

  // await coder.createTokenWithMetadata(tokenInfo);

  // //   Step 2: Create Pool
  // const tokenA = "8uC5Vc8MWphdX91ABfz1i6dSLYodBWQztBQqfPpxx15u"; //token Address of token deployed from above
  // const tokenB = SOL_MINT;
  // //   await coder.createPool({
  // //     tokenA,
  // //     tokenB,
  // //     mintAamount: 100000,
  // //     mintBamount: 0.5,
  // //   });

  // //   //Step 3 : Deposit and Withdraw
  // const poolId = "CJDu7i9DaTNFkznWvh2PQ1fdVmALkzek342vPCLDbwct"; // Poolid Created from above
  // //   await coder.deposit(poolId, "1");
  // //   await coder.withdraw(poolId, "7");
})();
