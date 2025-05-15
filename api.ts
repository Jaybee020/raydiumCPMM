// api.ts
import express, { Express, Request, Response } from "express";
import { readState, BotState } from "./stateManager"; // Adjust path to your stateManager
import cors from "cors"; // For handling Cross-Origin Resource Sharing

export function setupApi(port: string | number): void {
    const app: Express = express();

    // Enable CORS for all routes (or configure more specifically)
    app.use(cors());

    // Middleware to parse JSON bodies (if you add POST/PUT routes later)
    app.use(express.json());

    // Endpoint to get the bot state
    app.get("/api/bot-state", async (req: Request, res: Response) => {
        try {
            const state: BotState = await readState();
            res.json(state);
        } catch (error) {
            console.error("API Error: Failed to read bot state:", error);
            res.status(500).json({ error: "Failed to retrieve bot state" });
        }
    });

    // Basic health check endpoint
    app.get("/api/health", (req: Request, res: Response) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.listen(port, () => {
        console.log(`API server listening on port ${port}`);
        console.log(`Bot state available at http://localhost:${port}/api/bot-state`);
    });
}