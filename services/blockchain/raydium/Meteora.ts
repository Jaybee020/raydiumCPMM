// meteor_client.ts

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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
import Queue from "bull";
import { CronJob } from "cron";
import { BN } from "@coral-xyz/anchor";
import { rpcConnection, SOLANA_RPC_URL } from "../../../constants";
import { CpAmm, PoolFeesParams } from "@meteora-ag/cp-amm-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { uploadMetadata } from "../../../utils";

TOKEN_PROGRAM_ID;
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
    uri: string;
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
        description: opts.description || "",
        image: opts.image || "",
        website: opts.website || "",
        twitter: opts.twitter || "",
        telegram: opts.telegram || "",
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
      }).sendAndConfirm(this.umi);

      console.log(`Successfully minted tokens (${mint.publicKey})`);

      return { mintAddress: mint.publicKey.toString(), txId: tx.signature };
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

      // First, get a configuration account from the available configs
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
      const initPrice =
        (opts.mintBamount / opts.mintAamount) *
        10 ** (tokenADecimals - tokenBDecimals);

      // Prepare parameters for pool creation
      const { initSqrtPrice, liquidityDelta } =
        this.cpAmm.preparePoolCreationParams({
          tokenAAmount: new BN(opts.mintAamount * 10 ** tokenADecimals),
          tokenBAmount: new BN(opts.mintBamount * 10 ** tokenBDecimals),
          minSqrtPrice: configState.sqrtMinPrice,
          maxSqrtPrice: configState.sqrtMaxPrice,
        });

      // Create a custom pool
      const poolFees: PoolFeesParams = {
        baseFee: {
          feeSchedulerMode: 0, // Linear
          cliffFeeNumerator: new BN(500000), // 0.5% fee (denominator is 10^8)
          numberOfPeriod: 0,
          reductionFactor: new BN(0),
          periodFrequency: new BN(0),
        },
        protocolFeePercent: 0,
        partnerFeePercent: 0,
        referralFeePercent: 0,
        dynamicFee: null,
      };

      const { tx, pool, position } = await this.cpAmm.createCustomPool({
        payer: this.wallet.publicKey,
        creator: this.wallet.publicKey,
        positionNft: positionNftKeypair.publicKey,
        tokenAMint: tokenAMint,
        tokenBMint: tokenBMint,
        tokenAAmount: new BN(opts.mintAamount * 10 ** tokenADecimals),
        tokenBAmount: new BN(opts.mintBamount * 10 ** tokenBDecimals),
        sqrtMinPrice: configState.sqrtMinPrice,
        sqrtMaxPrice: configState.sqrtMaxPrice,
        initSqrtPrice,
        liquidityDelta,
        poolFees,
        hasAlphaVault: false,
        collectFeeMode: 0,
        activationPoint: new BN(0),
        activationType: 0,
        tokenAProgram:
          opts.tokenAProgram ||
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        tokenBProgram:
          opts.tokenBProgram ||
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });

      // Sign and send the transaction
      const txId = await this.connection.sendTransaction(tx, [
        this.wallet,
        positionNftKeypair,
      ]);
      await this.connection.confirmTransaction(txId);

      console.log("Pool created", {
        poolId: pool.toString(),
        positionId: position.toString(),
        txId,
      });

      // Return the pool ID, position ID, and transaction ID
      return {
        poolId: pool.toString(),
        positionId: position.toString(),
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
      const positionState = await this.cpAmm.fetchPositionState(position);

      // Calculate liquidity delta based on token amounts
      const { liquidityDelta } = this.cpAmm.getDepositQuote({
        inAmount: new BN(tokenAAmount),
        isTokenA: true,
        minSqrtPrice: poolState.sqrtMinPrice,
        maxSqrtPrice: poolState.sqrtMaxPrice,
        sqrtPrice: poolState.sqrtPrice,
      });

      // Find the position NFT account
      const positionNftAccount = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: positionState.nftMint }
      );

      if (positionNftAccount.value.length === 0) {
        throw new Error("Position NFT account not found");
      }

      // Add liquidity
      const addLiquidityTx = await this.cpAmm.addLiquidity({
        owner: this.wallet.publicKey,
        pool,
        position,
        positionNftAccount: positionNftAccount.value[0].pubkey,
        liquidityDelta,
        maxAmountTokenA: new BN(tokenAAmount),
        maxAmountTokenB: new BN(tokenBAmount),
        tokenAAmountThreshold: new BN(0), // No minimum threshold
        tokenBAmountThreshold: new BN(0), // No minimum threshold
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        tokenBProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
      });

      const tx = addLiquidityTx;
      tx.sign(this.wallet);

      const txId = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

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
      const position = new PublicKey(positionId);

      const poolState = await this.cpAmm.fetchPoolState(pool);
      const positionState = await this.cpAmm.fetchPositionState(position);

      const positionNftAccount = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: positionState.nftMint }
      );

      if (positionNftAccount.value.length === 0) {
        throw new Error("Position NFT account not found");
      }

      const removeAllLiquidityTx = await this.cpAmm.removeAllLiquidity({
        owner: this.wallet.publicKey,
        pool,
        position,
        positionNftAccount: positionNftAccount.value[0].pubkey,
        tokenAAmountThreshold: new BN(0), // No minimum threshold
        tokenBAmountThreshold: new BN(0), // No minimum threshold
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        tokenBProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        ),
        vestings: [],
        currentPoint: new BN(0),
      });

      const tx = removeAllLiquidityTx;
      tx.sign(this.wallet);
      const txId = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

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
  async closePosition(positionId: string) {
    try {
      const position = new PublicKey(positionId);

      const positionState = await this.cpAmm.fetchPositionState(position);

      const positionNftAccount = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: positionState.nftMint }
      );

      if (positionNftAccount.value.length === 0) {
        throw new Error("Position NFT account not found");
      }

      const closePositionTx = await this.cpAmm.closePosition({
        owner: this.wallet.publicKey,
        pool: positionState.pool,
        position,
        positionNftMint: positionState.nftMint,
        positionNftAccount: positionNftAccount.value[0].pubkey,
      });

      const tx = closePositionTx;
      tx.sign(this.wallet);
      const txId = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("Position closed", { txId });

      return { txId };
    } catch (error) {
      console.error("Error closing position:", error);
      throw error;
    }
  }
}
