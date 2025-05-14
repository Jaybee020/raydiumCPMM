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

export const txQueue = new Queue(
  "txQueue",
  `redis://${REDIS_URL || "127.0.0.1:6379"}`
);

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

  if (!createPoolOutput || !createPoolOutput.txId)
    throw new Error("Pool creation failed");

  const poolId = createPoolOutput.poolId; // Poolid Created from above
  const lpMint = createPoolOutput.lpMint;

  // const poolId = "F4AwVj7EneaDLvgA7Lrfd6Pk7emgbSfip3Mmfhqc3pn1";
  // const lpMint = "AKgJoE2jeHvRKHeirYNzofvzF1p1H7sDC7spbmMMfjxS";
  await sleep(5000);

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

  const tokenA = createTokenOutput.mintAddress; //token Address of token deployed from above
  const tokenB = SOL_MINT;
  const createPoolOutput = await coder.createPool({
    tokenA,
    tokenB,
    mintAamount: Math.floor(tokenDetails.supply * 1), //deposit 99% supply
    mintBamount: SOL_AMOUNT_TO_DEPOSIT,
  });

  if (!createPoolOutput || !createPoolOutput.txId)
    throw new Error("Pool creation failed");

  const poolId = createPoolOutput.poolId; // Poolid Created from above
  const positionId = createPoolOutput.positionId;

  // const poolId = "F4AwVj7EneaDLvgA7Lrfd6Pk7emgbSfip3Mmfhqc3pn1";
  // const lpMint = "AKgJoE2jeHvRKHeirYNzofvzF1p1H7sDC7spbmMMfjxS";
  await sleep(5000);

  // await coder.addLiquidity(
  //   poolId,
  //   positionId,
  //   SOL_AMOUNT_TO_DEPOSIT,
  //   tokenDetails.supply
  // );
  //how do I get amount of LP to remove

  await coder.removeAllLiquidity(poolId, positionId);
  await coder.closePosition(positionId);
}

//Consumer queue process to be performed in background
txQueue.process(async function (job, done) {
  try {
    await runBotRaydium();
    done();
  } catch (error: any) {
    console.error(error);
    done(error);
  }
});

export const txCron = new CronJob("* */1 * * *", async function () {
  try {
    await txQueue.add(
      {},
      {
        attempts: 3,
        backoff: 3000,
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  } catch (error) {
    console.error(error);
  }
});
