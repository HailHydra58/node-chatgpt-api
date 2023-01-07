#!/usr/bin/env node
import fastify from 'fastify';
import { ChatGPTAPIBrowser } from 'chatgpt';
import fs from 'fs';

const arg = process.argv.find((arg) => arg.startsWith('--settings'));
let path;
if (arg) {
    path = arg.split('=')[1];
} else {
    path = './settings.js';
}

let settings;
if (fs.existsSync(path)) {
    // get the full path
    const fullPath = fs.realpathSync(path);
    settings = (await import(fullPath)).default;
} else {
    if (arg) {
        console.error(`Error: the file specified by the --settings parameter does not exist.`);
    } else {
        console.error(`Error: the settings.js file does not exist.`);
    }
    process.exit(1);
}

const accounts = [];

for (let i = 0; i < settings.accounts.length; i++) {
    const account = settings.accounts[i];
    const api = new ChatGPTAPIBrowser({
        email: account.email,
        password: account.password,
        proxyServer: account.proxy,
        nopechaKey: settings.nopechaKey,
    });

    api.initSession().then(() => {
        console.log(`Session initialized for account ${i}.`);
        accounts.push(api);
    });

    // call `api.refreshSession()` every hour to refresh the session
    setInterval(() => {
        api.refreshSession().then(() => {
            console.log(`Session refreshed for account ${i}.`);
        });
    }, 60 * 60 * 1000);
}

let currentAccountIndex = 0;

const server = fastify();

server.post('/conversation', async (request, reply) => {
    if (accounts.length === 0) {
        reply.code(503).send({ error: 'No sessions available.' });
        return;
    }

    currentAccountIndex = (currentAccountIndex + 1) % accounts.length;

    let result;
    let error;
    try {
        result = await accounts[currentAccountIndex].sendMessage(request.body.message, {
            conversationId: request.body.conversationId,
            parentMessageId: request.body.parentMessageId,
        });
        console.log(result);
    } catch (e) {
        error = e;
    }

    if (result !== undefined) {
        reply.send(result);
    } else {
        console.error(error);
        reply.code(503).send({ error: 'There was an error communicating with ChatGPT.' });
    }
});

server.listen({ port: settings.port || 3000 }, (error) => {
    if (error) {
        console.error(error);
        process.exit(1);
    }
});