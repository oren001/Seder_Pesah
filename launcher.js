const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'server.log');
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

console.log('Starting server on port 3004...');
const child = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: '3004' },
    detached: true,
    stdio: ['ignore', out, err]
});

child.unref();
console.log('Server started in background. Logs are in server.log');
process.exit(0);
