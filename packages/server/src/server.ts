
import { createGameServer } from './simulation/GameServer.js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const PORT = parseInt(process.env.PORT || '3000', 10);

console.log('Starting SNAPSHOT Game Server...');

const server = createGameServer({
    port: PORT,
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
