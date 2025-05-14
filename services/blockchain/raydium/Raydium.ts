// raydium_integration.ts

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  createSignerFromKeypair,
  generateSigner,
  percentAmount,
  signerIdentity,
  Umi,
} from "@metaplex-foundation/umi";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createAndMint,
  createV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  ApiV3PoolInfoStandardItemCpmm,
  CpmmKeys,
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEV_CREATE_CPMM_POOL_FEE_ACC,
  DEV_CREATE_CPMM_POOL_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  Percent,
  Raydium,
  TxVersion,
} from "@raydium-io/raydium-sdk-v2";
import {
  exportedKeyPair,
  initSdk,
  keypair,
  rpcConnection,
  SOLANA_RPC_URL,
  wallet,
} from "../../../constants";
import { BN } from "@coral-xyz/anchor";
import { isValidCpmm } from "../../../utils";
import Decimal from "decimal.js";

export interface MetadataInput {
  name: string;
  symbol: string;
  sellerFeeBasisPoints: number;
  creators: { address: PublicKey; verified: boolean; share: number }[];
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
}

export type CreateTokenOptions = {
  mintAuthority: PublicKey;
  /** default (`mintAuthority`) */
  payer?: PublicKey;
  /** default (`mintAuthority`) */
  freezAuthority?: PublicKey;
  /** default (`0`) */
  decimal?: number;
  /** default (`Keypair.genrate()`) */
  mintKeypair?: Keypair;
  mintingInfo?: {
    /** default (`mintAuthority`) */
    tokenReceiver?: PublicKey;
    /** default (`1`) */
    tokenAmount?: number;
    /** default (`false`) */
    allowOffCurveOwner?: boolean;
  };
};

export class RaydiumClient {
  private connection: Connection;
  private wallet: Keypair;
  private umi: Umi;

  constructor(walletSecret: number[]) {
    this.connection = rpcConnection;
    console.log(SOLANA_RPC_URL);

    this.umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());
    const userWallet = this.umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(walletSecret)
    );
    this.wallet = Keypair.fromSecretKey(Uint8Array.from(walletSecret));
    const userWalletSigner = createSignerFromKeypair(this.umi, userWallet);
    this.umi.use(signerIdentity(userWalletSigner));
  }

  /**
   * Create a new SPL token mint and attach metadata
   * @param supply - initial token supply
   * @param decimals - decimal places
   * @param metadataUri - URI pointing to JSON metadata
   * @param metadataData - metadata fields (name, symbol, etc.)
   * @returns PublicKey of the new mint
   */
  async createTokenWithMetadata(opts: {
    name: string;
    symbol: string;
    uri: string;
    decimals?: number;
    supply?: number;
  }) {
    const mint = generateSigner(this.umi);
    console.log(mint);
    createAndMint(this.umi, {
      mint,
      authority: this.umi.identity,
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri,
      sellerFeeBasisPoints: percentAmount(0),
      decimals: opts.decimals || 6,
      amount: opts.supply || 1000000_00000000,
      //@ts-ignore
      tokenOwner: this.wallet.publicKey,
      tokenStandard: TokenStandard.Fungible,
    })
      .sendAndConfirm(this.umi)
      .then(() => {
        console.log(
          "Successfully minted 1 million tokens (",
          mint.publicKey,
          ")"
        );
      })
      .catch((err) => {
        console.error("Error minting tokens:", err);
      });
  }

  /**
   * Create a CPMM pool on Raydium between two tokens
   * @param tokenA - PublicKey string of base mint
   * @param tokenB - PublicKey string of quote mint
   * @param amountA - base token amount in raw units
   * @param amountB - quote token amount in raw units
   * @returns PublicKey of the created pool
   */
  async createPool(opts: {
    tokenA: string;
    tokenB: string;
    mintAamount: number;
    mintBamount: number;
  }) {
    const raydium = await initSdk();
    const feeConfigs = await raydium.api.getCpmmConfigs();

    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index
        ).publicKey.toBase58();
      });
    }
    const mintA = await raydium.token.getTokenInfo(opts.tokenA);
    const mintB = await raydium.token.getTokenInfo(opts.tokenB);
    const inputAAmount = new BN(
      new Decimal(opts.mintAamount).mul(10 ** mintA.decimals).toFixed(0)
    );
    const inputBAmount = new BN(
      new Decimal(opts.mintBamount).mul(10 ** mintB.decimals).toFixed(0)
    );
    console.log(raydium.cluster);
    const { execute, extInfo } = await raydium.cpmm.createPool({
      // poolId: // your custom publicKey, default sdk will automatically calculate pda pool id
      programId:
        raydium.cluster === "devnet"
          ? DEV_CREATE_CPMM_POOL_PROGRAM
          : CREATE_CPMM_POOL_PROGRAM, // devnet: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
      poolFeeAccount:
        raydium.cluster === "devnet"
          ? DEV_CREATE_CPMM_POOL_FEE_ACC
          : CREATE_CPMM_POOL_FEE_ACC, // devnet:  DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC
      mintA,
      mintB,
      mintAAmount: new BN(inputAAmount),
      mintBAmount: new BN(inputBAmount),
      startTime: new BN(0),
      feeConfig: feeConfigs[0],
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion: TxVersion.V0,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
    });

    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute\
    console.log("pool created", {
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
    });
    const { txId } = await execute();
    console.log("pool created", {
      txId,
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
    });
  }

  /**
   * Deposit liquidity into a CPMM pool
   * @param poolId - PublicKey string of the pool
   * @param tokenMint - which token side (base or quote)
   * @param amount - amount in raw units
   */
  async deposit(poolId: string, amount: string): Promise<void> {
    const raydium = await initSdk();
    let poolInfo: ApiV3PoolInfoStandardItemCpmm;
    let poolKeys: CpmmKeys | undefined;

    if (raydium.cluster === "mainnet") {
      // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
      // if you wish to get pool info from rpc, also can modify logic to go rpc method directly
      const data = await raydium.api.fetchPoolById({ ids: poolId });
      poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
      if (!isValidCpmm(poolInfo.programId))
        throw new Error("target pool is not CPMM pool");
    } else {
      const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }

    const inputAmount = new BN(
      new Decimal(amount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
    );
    const slippage = new Percent(1, 100); // 1%
    const baseIn = true;

    const { execute } = await raydium.cpmm.addLiquidity({
      poolInfo,
      poolKeys,
      inputAmount,
      slippage,
      baseIn,
      txVersion: TxVersion.V0,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },

      // optional: add transfer sol to tip account instruction. e.g sent tip to jito
      // txTipConfig: {
      //   address: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
      //   amount: new BN(10000000), // 0.01 sol
      // },
    });
    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    // const { txId } = await execute({ sendAndConfirm: true })
    // console.log('pool deposited', { txId: `https://explorer.solana.com/tx/${txId}` })
    // process.exit() // if you don't want to end up node execution, comment this line

    const { txId } = await execute({ sendAndConfirm: true });
    console.log(`pool deposited`, {
      txId,
    });
  }

  /**
   * Withdraw liquidity from a CPMM pool
   * @param poolId - PublicKey string of the pool
   * @param lpAmount - amount of LP tokens to burn
   */
  async withdraw(poolId: string, lpAmount: string): Promise<void> {
    const raydium = await initSdk();

    let poolInfo: ApiV3PoolInfoStandardItemCpmm;
    let poolKeys: CpmmKeys | undefined;

    if (raydium.cluster === "mainnet") {
      // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
      // if you wish to get pool info from rpc, also can modify logic to go rpc method directly
      const data = await raydium.api.fetchPoolById({ ids: poolId });
      poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
      if (!isValidCpmm(poolInfo.programId))
        throw new Error("target pool is not CPMM pool");
    } else {
      const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }

    const slippage = new Percent(1, 100); // 1%
    const inputamount = new BN(new Decimal(lpAmount).mul(10 ** 9).toFixed(0));

    const { execute } = await raydium.cpmm.withdrawLiquidity({
      poolInfo,
      poolKeys,
      lpAmount: inputamount,
      txVersion: TxVersion.V0,
      slippage,

      // closeWsol: false, // default if true, if you want use wsol, you need set false

      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
      // optional: add transfer sol to tip account instruction. e.g sent tip to jito
      // txTipConfig: {
      //   address: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
      //   amount: new BN(10000000), // 0.01 sol
      // },
    });

    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    const { txId } = await execute({ sendAndConfirm: true });
    console.log("pool withdraw:", {
      txId: `${txId}`,
    });

    // await execute();
  }
}
