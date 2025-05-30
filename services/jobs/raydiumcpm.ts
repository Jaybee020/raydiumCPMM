import Queue from "bull";
import {
  exportedKeyPair,
  keypair,
  REDIS_URL,
  rpcConnection,
  SOL_AMOUNT_TO_DEPOSIT,
  SOL_MINT,
  tokenDetails,
} from "../../constants";
import { RaydiumClient } from "../blockchain/raydium/Raydium";
import { CronJob } from "cron";
import { getSPLBalance, sleep } from "../../utils";
import { MeteorClient } from "../blockchain/raydium/Meteora";
import { PublicKey } from "@solana/web3.js";

// export const txQueue = new Queue(
//   "txQueue",
//   `redis://${REDIS_URL || "127.0.0.1:6379"}`
// );

export async function runBotRaydium() {
  console.log("Started Job Raydium");
  const coder = new RaydiumClient(keypair.secretKey as any);

  const createTokenOutput = await coder.createTokenWithMetadata(tokenDetails);
  if (
    !createTokenOutput ||
    !createTokenOutput.mintAddress ||
    !createTokenOutput.txId
  )
    throw new Error("Token creation failed");

  await sleep(5000);

  const tokenA = createTokenOutput.mintAddress; //token Address of token deployed from above
  const tokenB = SOL_MINT;
  const createPoolOutput = await coder.createPool({
    tokenA,
    tokenB,
    mintAamount: Math.floor(tokenDetails.supply * 1), //deposit 99% supply
    mintBamount: SOL_AMOUNT_TO_DEPOSIT,
  });

  if (!createPoolOutput || !createPoolOutput.txId || !createPoolOutput.lpMint)
    throw new Error("Pool creation failed");

  const poolId = createPoolOutput.poolId; // Poolid Created from above
  const lpMint = createPoolOutput.lpMint;

  // const poolId = "4r1C7N5fejpYNd23BZCfEh1gYi7NrjH5bTWfxriM1M2S";
  // const lpMint = new PublicKey("H1ssQYvvXvAUC3p32jco98iPXfnZdUoqu1RNvVqoMfY5");

  // await sleep(5000);

  //     await coder.deposit(poolId, "1");
  //how do I get amount of LP to remove
  const LpBalance = await getSPLBalance(
    rpcConnection,
    lpMint,
    exportedKeyPair.publicKey
  );
  console.log(LpBalance, "LpBalance");
  if (!LpBalance || LpBalance === 0) throw new Error("LpBalance is 0");
  await coder.withdraw(poolId, LpBalance.toString());
}

export async function runBotMeteora() {
  console.log("Started Job Meteora");
  const coder = new MeteorClient(keypair.secretKey as any);

  const createTokenOutput = await coder.createTokenWithMetadata(tokenDetails);
  if (
    !createTokenOutput ||
    !createTokenOutput.mintAddress ||
    !createTokenOutput.txId
  )
    throw new Error("Token creation failed");

  await sleep(5000);

  const tokenA = createTokenOutput.mintAddress; //"AvofckpAemUUpW4WAT2yEugxaUMpM1gsePr8P54Netwk"; //createTokenOutput.mintAddress; //token Address of token deployed from above
  const tokenB = SOL_MINT;
  const createPoolOutput = await coder.createPool({
    tokenA,
    tokenB,
    mintAamount: Math.floor(tokenDetails.supply * 0.1), //deposit 99% supply
    mintBamount: SOL_AMOUNT_TO_DEPOSIT,
  });

  if (!createPoolOutput || !createPoolOutput.txId)
    throw new Error("Pool creation failed");

  const poolId = createPoolOutput.poolId; // Poolid Created from above
  const positionId = createPoolOutput.positionId;

  // await sleep(5000);

  // const poolId = "BV8gSML8N8xFSrCdJKU59yMbdZaFgQexNnxLiPsfC1S7";
  // const lpMint = "AKgJoE2jeHvRKHeirYNzofvzF1p1H7sDC7spbmMMfjxS";
  // const positionId = "YfHMLheu1kXjVHnYo1vazvbBFUjm6GxEan8D1DdGXVf";

  // await coder.addLiquidity(
  //   poolId,
  //   positionId,
  //   SOL_AMOUNT_TO_DEPOSIT,
  //   tokenDetails.supply
  // );
  //how do I get amount of LP to remove

  // await coder.removeAllLiquidity(poolId, positionId);
  // await coder.closePosition(poolId, positionId);
  await coder.removeAllLiquidityAndClosePosition(poolId, positionId);
}

//Consumer queue process to be performed in background
// txQueue.process(async function (job, done) {
//   try {
//     await runBotRaydium();
//     done();
//   } catch (error: any) {
//     console.error(error);
//     done(error);
//   }
// });

export const txCron = new CronJob("* */1 * * *", async function () {
  try {
    await runBotMeteora();
    // await txQueue.add(
    //   {},
    //   {
    //     attempts: 3,
    //     backoff: 3000,
    //     removeOnComplete: true,
    //     removeOnFail: true,
    //   }
    // );
  } catch (error) {
    console.error(error);
  }
});
