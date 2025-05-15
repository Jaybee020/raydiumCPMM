import { WSOLMint } from "@raydium-io/raydium-sdk-v2";
import { exportedKeyPair, keypair, rpcConnection, SOL_MINT } from "./constants";
import { RaydiumClient } from "./services/blockchain/raydium/Raydium";
import { runBotMeteora } from "./services/jobs/raydiumcpm";
import { PublicKey } from "@solana/web3.js";
import { getSPLBalance } from "./utils";
import { CronJob } from "cron";
import { setupApi } from "./api";


export const txCron = new CronJob(
  '0 00 * * * *', // Runs at the 0th second of the 0th minute of every hour
  async function () {
    const timestamp = () => `[${new Date().toISOString()}]`;
    console.log(`${timestamp()} Hourly Meteora Bot Cron Job triggered.`);
    try {
      await runBotMeteora(); // This now handles scheduling its own withdrawal
    } catch (error) {
      console.error(`${timestamp()} Error in hourly Meteora Bot Cron Job execution:`, error);
      // Errors from runBotMeteora (like token/pool creation failure) are caught here.
      // Errors from the setTimeout's withdrawLiquidityFromMeteora are caught within the setTimeout callback.
    }
  },
  null, // onComplete
  true, // Start job automatically when CronJob is instantiated
  "UTC" // Or your preferred timezone
);

async function startApp() {
  const port = process.env.PORT || 3000;
  console.log("Initializing application...");

  // 1. Setup API Server
  try {
    setupApi(port); // This will start listening
  } catch (err) {
    console.error("Failed to setup API server:", err);
    process.exit(1);
  }

  // 2. Start Cron Job
  if (!(txCron as any).running) {
    txCron.start();
    console.log(`Cron job started. Scheduled to run at the beginning of every hour (UTC).`);
  }

  console.log("Application initialized and running.");
}

// --- Global Error Handling for Uncaught Exceptions/Rejections ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Application specific logging, throwing an error, or other logic here
  // It's often recommended to gracefully shut down the process after an uncaught exception
  process.exit(1);
});


// --- RUN THE APP ---
startApp().catch(err => {
  console.error("Critical error during application startup:", err);
  process.exit(1);
});
