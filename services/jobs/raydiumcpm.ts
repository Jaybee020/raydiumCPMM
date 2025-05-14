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

export const txQueue = new Queue(
  "txQueue",
  `redis://${REDIS_URL || "127.0.0.1:6379"}`
);

export async function runBot() {
  console.log("Started Job");
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
    mintAamount: Math.floor(tokenDetails.supply * 0.99), //deposit 99% supply
    mintBamount: SOL_AMOUNT_TO_DEPOSIT,
  });

  if (!createPoolOutput || !createPoolOutput.txId)
    throw new Error("Pool creation failed");

  const poolId = createPoolOutput.poolId; // Poolid Created from above
  const lpMint = createPoolOutput.lpMint;

  await sleep(5000);

  //     await coder.deposit(poolId, "1");
  //how do I get amount of LP to remove
  const LpBalance = await getSPLBalance(
    rpcConnection,
    lpMint,
    exportedKeyPair.publicKey
  );
  await coder.withdraw(poolId, LpBalance.toString());
}

//Consumer queue process to be performed in background
txQueue.process(async function (job, done) {
  try {
    await runBot();
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
