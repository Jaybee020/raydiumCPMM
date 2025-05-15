import { MeteorClient } from "../blockchain/raydium/Meteora";
import { keypair, perpTokenConfig } from "../../constants";
import { readState, writeState } from "../../stateManager";

// Utility
const timestamp = () => `[${new Date().toISOString()}]`;

async function withdrawLiquidityFromMeteora(
  poolId: string,
  positionId: string,
  tokenMintForLogging: string | null
) {
  console.log(
    `${timestamp()} Initiating withdrawal for pool ${poolId}, position ${positionId} (Token: ${tokenMintForLogging}).`
  );

  const meteoraClient = new MeteorClient(keypair.secretKey as any);

  try {
    await meteoraClient.removeAllLiquidity(poolId, positionId);
    console.log(
      `${timestamp()} Liquidity removed from pool ${poolId}, position ${positionId}.`
    );

    const state = await readState();

    if (
      state.currentPoolId === poolId &&
      state.currentPositionId === positionId
    ) {
      state.liquidityWithdrawn = true;
      await writeState(state);
      console.log(
        `${timestamp()} State updated: liquidityWithdrawn = true for pool ${poolId}.`
      );
    } else {
      console.warn(
        `${timestamp()} WARNING: Pool mismatch during withdrawal. Expected: ${poolId}, Found: ${
          state.currentPoolId
        }`
      );
    }

    // Optional: Close position
    // try {
    //   await meteoraClient.closePosition(poolId, positionId);
    //   console.log(`${timestamp()} Position ${positionId} closed.`);
    // } catch (err) {
    //   console.error(`${timestamp()} Error closing position:`, err);
    // }
  } catch (err) {
    console.error(
      `${timestamp()} Error withdrawing from Meteora pool ${poolId}:`,
      err
    );
  }
}

// export async function runBotMeteora() {
//   console.log(`${timestamp()} Starting Meteora Bot...`);

//   let state = await readState();
//   const meteoraClient = new MeteorClient(keypair.secretKey as any);
//   const currentIteration = (state.iteration || 0) + 1;

//   // Detect and log if previous liquidity wasn't withdrawn
//   if (state.currentPoolId && state.currentPositionId && !state.liquidityWithdrawn) {
//     console.warn(`${timestamp()} WARNING: Previous pool ${state.currentPoolId} still marked as unwithdrawn.`);
//   }

//   // --- Step 1: Create new PERP token ---
//   const tokenSymbol = `PERP${currentIteration}`;
//   const tokenName = "PERPRUG.FUN";

//   const tokenConfig = {
//     ...perpTokenConfig,
//     name: tokenName,
//     symbol: tokenSymbol,
//   };

//   let newTokenMint: string;

//   try {
//     console.log(`${timestamp()} Creating token ${tokenSymbol}...`);
//     const { mintAddress, txId } = await meteoraClient.createTokenWithMetadata(tokenConfig);
//     if (!mintAddress || !txId) throw new Error("Invalid token creation result.");
//     newTokenMint = mintAddress;
//     console.log(`${timestamp()} Token created: ${newTokenMint}. Tx: ${txId}`);
//   } catch (err) {
//     console.error(`${timestamp()} Token creation failed:`, err);
//     throw err;
//   }

//   await sleep(5000); // Ensure token is propagated

//   // --- Step 2: Create Meteora Pool ---
//   const tokenA = newTokenMint;
//   const tokenB = SOL_MINT;
//   const mintAamount = Math.floor(perpTokenConfig.supply * (10 ** perpTokenConfig.decimals) * PERP_TOKEN_DEPOSIT_PERCENTAGE);
//   const mintBamount = SOL_AMOUNT_TO_DEPOSIT_METEORA;

//   let poolId: string;
//   let positionId: string;

//   try {
//     console.log(`${timestamp()} Creating pool with ${tokenA} and ${tokenB}...`);
//     const { poolId: pid, positionId: posId, txId } = await meteoraClient.createPool({
//       tokenA,
//       tokenB,
//       mintAamount,
//       mintBamount,
//     });

//     if (!pid || !posId || !txId) throw new Error("Invalid pool creation result.");

//     poolId = pid;
//     positionId = posId;

//     console.log(`${timestamp()} Pool created: Pool ID = ${poolId}, Position ID = ${positionId}. Tx: ${txId}`);

//     state = {
//       ...state,
//       iteration: currentIteration,
//       createdTokenAddress: newTokenMint,
//       currentPoolId: poolId,
//       currentPositionId: positionId,
//       liquidityWithdrawn: false,
//     };
//     await writeState(state);
//     console.log(`${timestamp()} State updated for new pool.`);
//   } catch (err) {
//     console.error(`${timestamp()} Pool creation failed:`, err);
//     throw err;
//   }

//   // --- Step 3: Schedule Liquidity Withdrawal ---
//   const minDelay = 15 * 60 * 1000; // 15 mins
//   const maxDelay = 45 * 60 * 1000; // 45 mins
//   const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
//   const when = new Date(Date.now() + delay).toLocaleTimeString();

//   console.log(`${timestamp()} Scheduling liquidity withdrawal in ${(delay / 60000).toFixed(1)} mins (~${when}).`);

//   setTimeout(() => {
//     withdrawLiquidityFromMeteora(poolId, positionId, newTokenMint).catch(err =>
//       console.error(`${timestamp()} Unhandled withdrawal error:`, err)
//     );
//   }, delay);

//   console.log(`${timestamp()} Bot cycle ${state.iteration} completed.`);
//   console.log(`${timestamp()} Final State:`, JSON.stringify(await readState(), null, 2));
// }

export async function runBotMeteora() {
  console.log(`${timestamp()} Starting Meteora Bot...`);

  let state = await readState();
  const meteoraClient = new MeteorClient(keypair.secretKey as any);
  const currentIteration = 28 + 2;

  // Detect and log if previous liquidity wasn't withdrawn
  if (
    state.currentPoolId &&
    state.currentPositionId &&
    !state.liquidityWithdrawn
  ) {
    console.warn(
      `${timestamp()} WARNING: Previous pool ${
        state.currentPoolId
      } still marked as unwithdrawn.`
    );
  }

  // --- Step 1: Create new PERP token ---
  const tokenSymbol = `PERP${currentIteration}`;
  const tokenName = "PERPRUG.FUN";

  const tokenConfig = {
    name: tokenName,
    symbol: tokenSymbol,
    ...perpTokenConfig,
  };

  let newTokenMint: string;

  try {
    console.log(`${timestamp()} Creating token ${tokenSymbol}...`);
    const { mintAddress, txId } = await meteoraClient.createTokenWithMetadata(
      tokenConfig
    );
    if (!mintAddress || !txId)
      throw new Error("Invalid token creation result.");
    newTokenMint = mintAddress;
    console.log(`${timestamp()} Token created: ${newTokenMint}. Tx: ${txId}`);
  } catch (err) {
    console.error(`${timestamp()} Token creation failed:`, err);
    throw err;
  }

  // await sleep(5000); // Ensure token is propagated

  // // --- Step 2: Create Meteora Pool ---
  // const tokenA = newTokenMint;
  // const tokenB = SOL_MINT;
  // const mintAamount = Math.floor(
  //   perpTokenConfig.supply * PERP_TOKEN_DEPOSIT_PERCENTAGE
  // ); // Keep as number
  // const mintBamount = SOL_AMOUNT_TO_DEPOSIT_METEORA;

  // let poolId: string;
  // let positionId: string;

  // try {
  //   console.log(`${timestamp()} Creating pool with ${tokenA} and ${tokenB}...`);
  //   const {
  //     poolId: pid,
  //     positionId: posId,
  //     txId,
  //   } = await meteoraClient.createPool({
  //     tokenA,
  //     tokenB,
  //     mintAamount, // Pass the number
  //     mintBamount,
  //   });
  //   if (!pid || !posId || !txId)
  //     throw new Error("Invalid pool creation result.");
  //   poolId = pid;
  //   positionId = posId;
  //   console.log(
  //     `${timestamp()} Pool created: Pool ID = ${poolId}, Position ID = ${positionId}. Tx: ${txId}`
  //   );
  //   state = {
  //     ...state,
  //     iteration: currentIteration,
  //     createdTokenAddress: newTokenMint,
  //     currentPoolId: poolId,
  //     currentPositionId: positionId,
  //     liquidityWithdrawn: false,
  //   };
  //   await writeState(state);
  //   console.log(`${timestamp()} State updated for new pool.`);
  // } catch (err) {
  //   console.error(`${timestamp()} Pool creation failed:`, err);
  //   throw err;
  // }

  // // --- Step 3: Schedule Liquidity Withdrawal ---
  // const minDelay = 15 * 60 * 1000; // 15 mins
  // const maxDelay = 45 * 60 * 1000; // 45 mins
  // const delay =
  //   Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  // const when = new Date(Date.now() + delay).toLocaleTimeString();

  // console.log(
  //   `${timestamp()} Scheduling liquidity withdrawal in ${(
  //     delay / 60000
  //   ).toFixed(1)} mins (~${when}).`
  // );

  // setTimeout(() => {
  //   withdrawLiquidityFromMeteora(poolId, positionId, newTokenMint).catch(
  //     (err) => console.error(`${timestamp()} Unhandled withdrawal error:`, err)
  //   );
  // }, delay);

  // console.log(`${timestamp()} Bot cycle ${state.iteration} completed.`);
  // console.log(
  //   `${timestamp()} Final State:`,
  //   JSON.stringify(await readState(), null, 2)
  // );
}
