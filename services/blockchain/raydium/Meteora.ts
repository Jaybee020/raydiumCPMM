// meteor_client.ts

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createSignerFromKeypair,
  generateSigner,
  percentAmount,
  signerIdentity,
  Umi,
} from "@metaplex-foundation/umi";
import {
  createAndMint,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { BN } from "@coral-xyz/anchor";
import {
  rpcConnection,
  SOLANA_RPC_URL,
  TOKENA_PROGRAM_ID,
  TOKENB_PROGRAM_ID,
} from "../../../constants";
import {
  CpAmm,
  derivePoolAddress,
  derivePositionAddress,
  derivePositionNftAccount,
} from "@meteora-ag/cp-amm-sdk";
import {
  AuthorityType,
  createSetAuthorityInstruction,
} from "@solana/spl-token";
import { getLatestBlockhash, sleep, uploadMetadata } from "../../../utils";

const SHOULD_REVOKE_AUTHORITY = true;
export class MeteorClient {
  private connection: Connection;
  private wallet: Keypair;
  private umi: Umi;
  private cpAmm: CpAmm;

  constructor(walletSecret: number[]) {
    this.connection = rpcConnection;
    this.wallet = Keypair.fromSecretKey(Uint8Array.from(walletSecret));

    // Initialize Umi for token creation
    this.umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());
    const userWallet = this.umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(walletSecret)
    );
    const userWalletSigner = createSignerFromKeypair(this.umi, userWallet);
    this.umi.use(signerIdentity(userWalletSigner));

    // Initialize the Meteor CP-AMM SDK
    this.cpAmm = new CpAmm(this.connection);
  }

  /**
   * Create a new SPL token mint and attach metadata
   * @param opts - Token options including name, symbol, supply, etc.
   * @returns PublicKey of the new mint and transaction ID
   */
  async createTokenWithMetadata(opts: {
    name: string;
    symbol: string;
    decimals?: number;
    supply?: number;
    description?: string;
    image?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
  }) {
    try {
      const mint = generateSigner(this.umi);

      // Prepare metadata
      const metadata = {
        name: opts.name,
        symbol: opts.symbol,
        description: opts.description,
        image: opts.image,
        website: opts.website,
        twitter: opts.twitter,
        telegram: opts.telegram,
        attributes: {
          decimals: opts.decimals,
          supply: opts.supply,
          website: opts.website,
          telegram: opts.telegram,
          twitter: opts.twitter,
        },
      };

      // Calculate token supply with decimals
      const totalSupplyWithDecimals = new BN(opts.supply || 10000000000)
        .mul(new BN(10).pow(new BN(opts.decimals || 9)))
        .toString();

      const uri = await uploadMetadata(metadata);

      // Create token with metadata and mint the supply
      const tx = await createAndMint(this.umi, {
        mint,
        authority: this.umi.identity,
        name: opts.name,
        symbol: opts.symbol,
        uri: uri,
        sellerFeeBasisPoints: percentAmount(0),
        decimals: opts.decimals || 9,
        amount: BigInt(totalSupplyWithDecimals),
        //@ts-ignore
        tokenOwner: this.wallet.publicKey,
        tokenStandard: TokenStandard.Fungible,
      }).send(this.umi);

      console.log(`Successfully minted tokens (${mint.publicKey})`);
      await sleep(8000);

      if (SHOULD_REVOKE_AUTHORITY) {
        const revokeTransaction = new Transaction();

        revokeTransaction.add(
          createSetAuthorityInstruction(
            new PublicKey(mint.publicKey.toString()),
            this.wallet.publicKey,
            AuthorityType.MintTokens,
            null
          )
        );

        // Add instruction to revoke freeze authority
        revokeTransaction.add(
          createSetAuthorityInstruction(
            new PublicKey(mint.publicKey.toString()),
            this.wallet.publicKey,
            AuthorityType.FreezeAccount,
            null
          )
        );

        // Sign and send the transaction
        const revokeAuthorityTxId = await this.signAndBroadcastTx(
          revokeTransaction
        );

        console.log(
          `Successfully revoked mint and freeze authorities (${mint.publicKey})`
        );
      }

      return {
        mintAddress: mint.publicKey.toString(),
        txId: tx,
      };
    } catch (error) {
      console.error("Error minting tokens:", error);
      throw error;
    }
  }

  /**
   * Create a pool using the Meteor CP-AMM
   * @param opts - Pool creation options
   * @returns Pool ID and transaction ID
   */
  async createPool(opts: {
    tokenA: string;
    tokenB: string;
    mintAamount: number;
    mintBamount: number;
    tokenAProgram?: PublicKey;
    tokenBProgram?: PublicKey;
  }) {
    try {
      // Generate a new keypair for the position NFT
      const positionNftKeypair = Keypair.generate();

      const configs = await this.cpAmm.getAllConfigs();
      if (configs.length === 0) {
        throw new Error("No configuration accounts found");
      }

      const configAccount = configs[0].publicKey;
      const configState = await this.cpAmm.fetchConfigState(configAccount);

      // Calculate initial price based on the token amounts
      // For simplicity, we'll use a 1:1 ratio adjusted for decimals
      const tokenAMint = new PublicKey(opts.tokenA);
      const tokenBMint = new PublicKey(opts.tokenB);

      // Get token info for decimals
      const tokenAInfo = await this.connection.getParsedAccountInfo(tokenAMint);
      const tokenBInfo = await this.connection.getParsedAccountInfo(tokenBMint);

      // @ts-ignore - Extract decimals from parsed info
      const tokenADecimals = tokenAInfo.value?.data.parsed.info.decimals || 9;
      // @ts-ignore - Extract decimals from parsed info
      const tokenBDecimals = tokenBInfo.value?.data.parsed.info.decimals || 9;

      // Calculate initial price (tokenB per tokenA)
      // const initPrice =
      //   (opts.mintBamount / opts.mintAamount) *
      //   10 ** (tokenADecimals - tokenBDecimals);

      // const { initSqrtPrice, liquidityDelta } =
      //   this.cpAmm.preparePoolCreationParams({
      //     tokenAAmount: tokenAAmount,
      //     tokenBAmount: tokenBAmount,
      //     minSqrtPrice: configState.sqrtMinPrice,
      //     maxSqrtPrice: configState.sqrtMaxPrice,
      //   });

      // // Create a custom pool
      // const poolFees: PoolFeesParams = {
      //   baseFee: {
      //     feeSchedulerMode: 0, // Linear
      //     cliffFeeNumerator: new BN(500000), // 0.5% fee (denominator is 10^8)
      //     numberOfPeriod: 0,
      //     reductionFactor: new BN(0),
      //     periodFrequency: new BN(0),
      //   },
      //   protocolFeePercent: 0,
      //   partnerFeePercent: 0,
      //   referralFeePercent: 0,
      //   dynamicFee: null,
      // };

      // const { tx, pool, position } = await this.cpAmm.createCustomPool({
      //   payer: this.wallet.publicKey,
      //   creator: this.wallet.publicKey,
      //   positionNft: positionNftKeypair.publicKey,
      //   tokenAMint: tokenAMint,
      //   tokenBMint: tokenBMint,
      //   tokenAAmount: tokenAAmount,
      //   tokenBAmount: tokenBAmount,
      //   sqrtMinPrice: configState.sqrtMinPrice,
      //   sqrtMaxPrice: configState.sqrtMaxPrice,
      //   initSqrtPrice,
      //   liquidityDelta,
      //   poolFees,
      //   hasAlphaVault: false,
      //   collectFeeMode: 0,
      //   activationPoint: new BN(0),
      //   activationType: 0,
      //   tokenAProgram:
      //     opts.tokenAProgram ||
      //     new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      //   tokenBProgram:
      //     opts.tokenBProgram ||
      //     new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      // });

      // Prepare parameters for pool creation
      const mintAmount = new BN(opts.mintAamount);
      const decimals = new BN(10).pow(new BN(tokenADecimals));
      const tokenAAmount = mintAmount.mul(decimals);
      const tokenBAmount = new BN(opts.mintBamount * 10 ** tokenBDecimals);
      const pool = derivePoolAddress(configAccount, tokenAMint, tokenBMint);
      const { initSqrtPrice, liquidityDelta } =
        this.cpAmm.preparePoolCreationParams({
          tokenAAmount: tokenAAmount,
          tokenBAmount: tokenBAmount,
          minSqrtPrice: configState.sqrtMinPrice,
          maxSqrtPrice: configState.sqrtMaxPrice,
        });

      const createPoolTx = await this.cpAmm.createPool({
        payer: this.wallet.publicKey,
        creator: this.wallet.publicKey,
        config: configAccount,
        positionNft: positionNftKeypair.publicKey,
        tokenAMint,
        tokenBMint,
        activationPoint: null,
        tokenAAmount: tokenAAmount,
        tokenBAmount: tokenBAmount,
        initSqrtPrice,
        liquidityDelta: liquidityDelta,
        tokenAProgram: TOKENA_PROGRAM_ID,
        tokenBProgram: TOKENB_PROGRAM_ID,
      });

      console.log(positionNftKeypair.publicKey.toString());
      const txId = await this.signAndBroadcastTx(
        createPoolTx,
        positionNftKeypair
      );
      console.log("Pool created", {
        poolId: pool.toString(),
        positionId: positionNftKeypair.publicKey,
        txId,
      });

      // Return the pool ID, position ID, and transaction ID
      return {
        poolId: pool.toString(),
        positionId: positionNftKeypair.publicKey.toString(),
        txId,
      };
    } catch (error) {
      console.error("Error creating pool:", error);
      throw error;
    }
  }

  /**
   * Add liquidity to an existing position
   * @param poolId - ID of the pool
   * @param positionId - ID of the position
   * @param tokenAAmount - Amount of token A to add
   * @param tokenBAmount - Amount of token B to add
   */
  async addLiquidity(
    poolId: string,
    positionId: string,
    tokenAAmount: number,
    tokenBAmount: number
  ) {
    try {
      const pool = new PublicKey(poolId);
      const position = new PublicKey(positionId);

      // Get pool and position states
      const poolState = await this.cpAmm.fetchPoolState(pool);

      // Calculate liquidity delta based on token amounts
      const { liquidityDelta } = this.cpAmm.getDepositQuote({
        inAmount: new BN(tokenAAmount),
        isTokenA: true,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
      });

      // Find the position NFT account
      const positionNftAccount = derivePositionNftAccount(position);

      // Add liquidity
      const addLiquidityTx = await this.cpAmm.addLiquidity({
        owner: this.wallet.publicKey,
        pool,
        position,
        positionNftAccount: positionNftAccount,
        liquidityDelta,
        maxAmountTokenA: new BN(tokenAAmount),
        maxAmountTokenB: new BN(tokenBAmount),
        tokenAAmountThreshold: new BN(0), // No minimum threshold
        tokenBAmountThreshold: new BN(0), // No minimum threshold
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKENA_PROGRAM_ID,
        tokenBProgram: TOKENB_PROGRAM_ID,
      });

      const tx = addLiquidityTx;
      const txId = await this.signAndBroadcastTx(tx);

      console.log("Liquidity added", { txId });

      return { txId, positionId };
    } catch (error) {
      console.error("Error adding liquidity:", error);
      throw error;
    }
  }

  /**
   * Remove all liquidity from a position
   * @param poolId - ID of the pool
   * @param positionId - ID of the position
   */
  async removeAllLiquidity(poolId: string, positionId: string) {
    try {
      const pool = new PublicKey(poolId);
      const positionNft = new PublicKey(positionId);

      const poolState = await this.cpAmm.fetchPoolState(pool);

      const position = derivePositionAddress(positionNft);
      console.log(position);
      // Remove all liquidity
      const removeAllLiquidityTx = await this.cpAmm.removeAllLiquidity({
        owner: this.wallet.publicKey,
        pool,
        position,
        positionNftAccount: derivePositionNftAccount(positionNft),
        tokenAAmountThreshold: new BN(0), // No minimum threshold
        tokenBAmountThreshold: new BN(0), // No minimum threshold
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: TOKENA_PROGRAM_ID,
        tokenBProgram: TOKENB_PROGRAM_ID,
        vestings: [],
        currentPoint: new BN(0),
      });

      // Build and send the transaction
      const tx = removeAllLiquidityTx;
      const txId = await this.signAndBroadcastTx(tx);
      console.log("Liquidity removed", { txId });

      return { txId };
    } catch (error) {
      console.error("Error removing liquidity:", error);
      throw error;
    }
  }

  /**
   * Close a position after all liquidity has been removed
   * @param positionId - ID of the position
   */
  async closePosition(poolId: string, positionId: string) {
    try {
      const positionNft = new PublicKey(positionId);

      const position = derivePositionAddress(positionNft);
      const positionNftAccount = derivePositionNftAccount(positionNft);

      // const positionNftAccount = await this.connection.getTokenAccountsByOwner(
      //   this.wallet.publicKey,
      //   { mint: positionState.nftMint }
      // );

      // if (positionNftAccount.value.length === 0) {
      //   throw new Error("Position NFT account not found");
      // }

      const closePositionTx = await this.cpAmm.closePosition({
        owner: this.wallet.publicKey,
        pool: new PublicKey(poolId),
        position,
        positionNftMint: positionNft,
        positionNftAccount: positionNftAccount,
      });

      const tx = closePositionTx;
      const txId = await this.signAndBroadcastTx(tx);

      console.log("Position closed", { txId });

      return { txId };
    } catch (error) {
      console.error("Error closing position:", error);
      throw error;
    }
  }

  /**
   * Removes all liquidity from a position and then closes it in one operation
   * @param poolId - ID of the pool
   * @param positionId - ID of the position NFT
   */
  async removeAllLiquidityAndClosePosition(poolId: string, positionId: string) {
    try {
      const pool = new PublicKey(poolId);
      const positionNft = new PublicKey(positionId);

      // Derive the position account from the position NFT mint
      const position = derivePositionAddress(positionNft);
      const positionNftAccount = derivePositionNftAccount(positionNft);

      // Get pool state and position state
      const poolState = await this.cpAmm.fetchPoolState(pool);
      const positionState = await this.cpAmm.fetchPositionState(position);

      // Check if position has any liquidity
      const totalLiquidity = positionState.unlockedLiquidity
        .add(positionState.vestedLiquidity)
        .add(positionState.permanentLockedLiquidity);

      if (totalLiquidity.isZero()) {
        // If no liquidity, just close the position
        console.log("Position has no liquidity, proceeding to close");
        const closePositionTx = await this.cpAmm.closePosition({
          owner: this.wallet.publicKey,
          pool,
          position,
          positionNftMint: positionNft,
          positionNftAccount,
        });

        const txId = await this.signAndBroadcastTx(closePositionTx);
        console.log("Position closed", { txId });
        return { txId };
      }

      // Position has liquidity, we need to remove it first then close
      console.log("Position has liquidity, removing liquidity then closing");

      // Use the SDK's built-in removeAllLiquidityAndClosePosition method which does both operations in one transaction
      const tx = await this.cpAmm.removeAllLiquidityAndClosePosition({
        owner: this.wallet.publicKey,
        position,
        positionNftAccount,
        positionState,
        poolState,
        tokenAAmountThreshold: new BN(0),
        tokenBAmountThreshold: new BN(0),
        vestings: [], // If there are any vestings, you would get them using getAllVestingsByPosition
        currentPoint: new BN(Math.floor(Date.now() / 1000)), // Current timestamp in seconds
      });

      const txId = await this.signAndBroadcastTx(tx);
      console.log("Successfully removed liquidity and closed position", {
        txId,
      });
      return { txId };
    } catch (error) {
      console.error("Error removing liquidity and closing position:", error);
      throw error;
    }
  }
  // Can you help me write a meteora client function that cremoves liquidity and closes all accounts at once

  async signAndBroadcastTx(tx: Transaction, otherSigner?: Keypair) {
    const blockhash = await getLatestBlockhash();
    tx.feePayer = this.wallet.publicKey;
    tx.recentBlockhash = blockhash;
    if (otherSigner) {
      tx.sign(this.wallet, otherSigner);
    } else {
      tx.sign(this.wallet);
    }
    console.log(this.wallet.publicKey.toString());
    const txId = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    return txId;
  }
}
