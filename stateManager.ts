// In src/stateManager.ts
import originalFs from 'fs';
import util from 'util';
import path from "path";

const fs = {
    readFile: util.promisify(originalFs.readFile),
    writeFile: util.promisify(originalFs.writeFile),
};

// import { PublicKey } from "@solana/web3.js"; // Not needed if state stores strings

const STATE_FILE_PATH = path.resolve(process.cwd(), "bot_state.json");
console.log("DEBUG stateManager.ts - Resolved STATE_FILE_PATH:", STATE_FILE_PATH);// Adjust path as needed

export interface BotState {
    iteration: number;
    createdTokenAddress: string | null; // Mint address of the PERP token
    currentPoolId: string | null;       // Meteora Pool ID
    currentPositionId: string | null;   // Meteora Position ID
    liquidityWithdrawn: boolean;
}

export async function readState(): Promise<BotState> {
    try {
        // Now `fs.readFile` returns a Promise directly
        const data = await fs.readFile(STATE_FILE_PATH, "utf-8");
        return JSON.parse(data) as BotState; // data will be a string
    } catch (error: any) {
        if (error.code === "ENOENT") {
            const defaultState: BotState = {
                iteration: 0,
                createdTokenAddress: null, // Corrected field name
                currentPoolId: null,
                currentPositionId: null,
                liquidityWithdrawn: true,
            };
            await writeState(defaultState);
            return defaultState;
        }
        console.error("Failed to read state file:", error);
        throw error;
    }
}

export async function writeState(state: BotState): Promise<void> {
    try {
        // Now `fs.writeFile` returns a Promise directly
        await fs.writeFile(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
    } catch (error) {
        console.error("Failed to write state file:", error);
        throw error;
    }
}