
import { createGameServer } from './simulation/GameServer.js';
import dotenv from 'dotenv';
import * as fs from 'node:fs';
import path from 'path';

// Load env vars
const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
    dotenv.config({ path: envPath });
}

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = process.env.HOST || '0.0.0.0';

console.log('Starting SNAPSHOT Game Server...');

const server = createGameServer({
    port: PORT,
    host: HOST,
    maxPlayers: 20, // Global limit, but matchmaking manages matches
    enablePhysics: false,
});

server.start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Server stopping...');
    server.stop();
    process.exit(0);
});
