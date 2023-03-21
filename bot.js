const { Client, GatewayIntentBits, Constants } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const amqp = require('amqplib');
const pm2 = require('pm2');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CephS3 } = require('ceph-s3');
const winston = require('winston');
const { createLogger, transports, format } = require('winston');
const { combine, timestamp, json } = format;

// Set up Winston logging
const logDirectory = './logs';
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}
const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logDirectory, `error-${new Date().toISOString().slice(0,10)}.log`), level: 'error' }),
    new transports.File({ filename: path.join(logDirectory, `combined-${new Date().toISOString().slice(0,10)}.log`) })
  ],
});

const app = express();
const router = express.Router();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Discord.Collection();

// Use object destructuring
const { MY_SHARD_ID, NUM_SHARDS } = process.env;
const { PREFIX, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, CEPH_ENDPOINT, CEPH_BUCKET_NAME } = require('./configs/config.json');

// Use caching
const configFileName = 'config.json';
const configDirectory = './configs';
const configFilePath = path.join(configDirectory, configFileName);
let config;

function getObject(endpoint, credentials, bucket, key) {
  const s3 = new S3Client({ endpoint, credentials });
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return s3.send(command);
}

function putObject(endpoint, credentials, bucket, key, body) {
  const s3 = new S3Client({ endpoint, credentials });
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body });
  return s3.send(command);
}

function getConfig() {
  if (config) {
    return Promise.resolve(config);
  }

  if (process.env.CONFIG_SOURCE === 'ceph') {
    return getObject(CEPH_ENDPOINT, {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }, CEPH_BUCKET_NAME, configFileName).then(data => {
      config = JSON.parse(data.Body.toString());
      return config;
    }).catch(err => {
      logger.error(`Failed to fetch config from Ceph S3: ${err}`);
      return Promise.reject(err);
    });
  } else {
    try {
      if (!fs.existsSync(configDirectory)) {
        fs.mkdirSync(configDirectory);
      }

      if (!fs.existsSync(configFilePath)) {
        fs.writeFileSync(configFilePath, JSON.stringify(DEFAULT_CONFIG));
      }

      const data = fs.readFileSync(configFilePath);
      config = JSON.parse(data);
      return Promise.resolve(config);
    } catch (err) {
      logger.error(`Failed to fetch local config file: ${err}`);
      return Promise.reject(err);
    }
  }
}

// Load the config on startup
getConfig().then(config => {
  logger.info(`Loaded config: ${JSON.stringify(config)}`);
}).catch(err => {
  logger.error(`Failed to load config: ${err}`);
  process.exit(1);
});

// Load modules
const modulePath = './modules';
let moduleFiles;
try {
  moduleFiles = fs.readdirSync(modulePath).filter(file => file.endsWith('.js'));
} catch (err) {
  logger.error(`Failed to find modules directory: ${err}`);
  process.exit(1);
}

for (const file of moduleFiles) {
  try {
    const module = require(`${modulePath}/${file}`);
    client.commands.set(module.name, module);
    logger.info(`Loaded command module: ${module.name}`);
  } catch (error) {
    logger.error(`Error loading command module: ${file} - ${error}`);
  }
}

// Execute command
async function executeCommand(message, commandName, args) {
  if (!client.commands.has(commandName)) return;

  const command = client.commands.get(commandName);

  try {
    await command.execute(message, args);
  } catch (error) {
    logger.error(`Error executing command: ${error}`);
    message.reply('There was an error trying to execute that command!');
  }
}

// Message event listener
client.on(Constants.Events.MESSAGE_CREATE, async message => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;
  
  // Distribute commands evenly across shards
  const shardId = message.guild ? message.guild.shardID : message.author.id % NUM_SHARDS;
  if (shardId !== MY_SHARD_ID) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  await executeCommand(message, commandName, args);
});

// Set up RabbitMQ
amqp.connect('amqp://localhost').then(connection => {
  return connection.createChannel();
}).then(channel => {
  const exchange = 'my-exchange';

  return channel.assertExchange(exchange, 'fanout', {
    durable: false
  }).then(() => {
    // Send message from shard
    return channel.publish(exchange, '', Buffer.from('Hello from shard 1!'));
  }).then(() => {
    // Receive messages in shard 2
    return channel.assertQueue('', {
      exclusive: true
    });
  }).then(q => {
    logger.info(`Shard 2 waiting for messages in queue ${q.queue}`);
    return channel.bindQueue(q.queue, exchange, '').then(() => {
      return channel.consume(q.queue, msg => {
        logger.info(`Shard 2 received message: ${msg.content.toString()}`);
      }, {
        noAck: true
      });
    });
  });
}).catch(err => {
  logger.error(`Error connecting to RabbitMQ: ${err}`);
});

// Use pm2
pm2.connect(err => {
  if (err) {
    logger.error(`Error connecting to PM2: ${err}`);
    process.exit(1);
  }

  pm2.start({
    script: 'bot.js',
    name: `my-bot-${MY_SHARD_ID}`,
    exec_mode: 'cluster',
    instances: NUM_SHARDS || 1,
    max_memory_restart: '500M'
  }, err => {
    pm2.disconnect();

    if (err) {
      logger.error(`Error starting PM2 process: ${err}`);
      process.exit(1);
    }
  });
});

// Set up API server

app.use(helmet());
app.use(compression());
app.use('/api', router);

router.get('/config', async (req, res) => {
  try {
    const config = await getConfig(configFilePath);
    res.json(config);
  } catch (err) {
    logger.error(`Error fetching config: ${err}`);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(3000, () => {
  logger.info(`Server started on port 3000`);
});

// Set up login
client.login(token);

// Set up shard management
const HEARTBEAT_INTERVAL_MS = 5000; // 5 seconds
const HEARTBEAT_TIMEOUT_MS = 10000; // 10 seconds

let masterShardId = 0;
let shardStatus = {};

// Function to send a heartbeat message to all other shards
function sendHeartbeat() {
  for (let i = 0; i < NUM_SHARDS; i++) {
    if (i !== MY_SHARD_ID && shardStatus[i] === 'online') {
      client.shard.send({ type: 'heartbeat', shardId: MY_SHARD_ID, timestamp: Date.now() });
    }
  }
}

// Function to handle incoming heartbeat messages
function handleHeartbeat(message) {
  const shardId = message.shardId;
  shardStatus[shardId] = 'online';
  shardStatus[`${shardId}-lastHeartbeat`] = message.timestamp;
}

// Function to handle a shard going offline
function handleShardOffline(shardId) {
  shardStatus[shardId] = 'offline';
  if (shardId === masterShardId) {
    // Select a new master shard randomly
    let newMasterShardId = Math.floor(Math.random() * NUM_SHARDS);
    while (shardStatus[newMasterShardId] === 'offline') {
      newMasterShardId = Math.floor(Math.random() * NUM_SHARDS);
    }
    masterShardId = newMasterShardId;
    // Broadcast the new master shard to all other shards
    client.shard.broadcastEval(`(${(shardId) => {
      masterShardId = {shardId};
    }})(${newMasterShardId});`);
  }
}

// Set up shard event handlers
client.on(Constants.Events.SHARD_READY, () => {
  logger.info(`Shard ${MY_SHARD_ID} is online`);
  shardStatus[MY_SHARD_ID] = 'online';
  // Send a heartbeat message every HEARTBEAT_INTERVAL_MS milliseconds
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
});

client.on(Constants.Events.SHARD_MESSAGE_CREATE, (message) => {
  if (message.type === 'heartbeat') {
    handleHeartbeat(message);
  }
});

// Set up RabbitMQ
let rabbitConnection;
let rabbitChannel;

amqp.connect('amqp://localhost').then(connection => {
  rabbitConnection = connection;
  return connection.createChannel();
}).then(channel => {
  rabbitChannel = channel;

  const exchange = 'my-exchange';
  const queue = `shard-${MY_SHARD_ID}`;

  return Promise.all([
    // Create the exchange if it doesn't exist
    channel.assertExchange(exchange, 'fanout', { durable: false }),
    // Create a queue for this shard to receive messages
    channel.assertQueue(queue, { exclusive: true }),
    // Bind the queue to the exchange
    channel.bindQueue(queue, exchange, ''),
  ]).then(() => {
    // Send a message to the exchange from all shards
    setInterval(() => {
      rabbitChannel.publish(exchange, '', Buffer.from(`Hello from shard ${MY_SHARD_ID}!`));
    }, 5000);

    // Receive messages on this shard's queue
    rabbitChannel.consume(queue, message => {
      logger.info(`Received message on shard ${MY_SHARD_ID}: ${message.content.toString()}`);
    }, { noAck: true });
  });
}).catch(err => {
  logger.error(`Error connecting to RabbitMQ: ${err}`);
});

// Set up shard event handlers
client.on(Constants.Events.SHARD_READY, () => {
  logger.info(`Shard ${MY_SHARD_ID} is online`);
});

client.on(Constants.Events.SHARD_MESSAGE_CREATE, message => {
  // Broadcast a message to the exchange from all shards
  rabbitChannel.publish('my-exchange', '', Buffer.from(`Broadcast from shard ${MY_SHARD_ID}: ${message.content}`));
});

// Graceful shutdown
process.on('SIGINT', () => {
  if (rabbitConnection) {
    rabbitConnection.close();
  }
  getConfig(configFilePath).then(config => {
    const configString = JSON.stringify(config, null, 2);
    putObject(CEPH_ENDPOINT, {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }, CEPH_BUCKET_NAME, 'config.json', configString);
    fs.writeFileSync(configFilePath, configString);
  });
  client.destroy();
  process.exit();
});

process.on('SIGTERM', () => {
  if (rabbitConnection) {
    rabbitConnection.close();
  }
  getConfig(configFilePath).then(config => {
    const configString = JSON.stringify(config, null, 2);
    putObject(CEPH_ENDPOINT, {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }, CEPH_BUCKET_NAME, 'config.json', configString);
    fs.writeFileSync(configFilePath, configString);
  });
  client.destroy();
  process.exit();
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err}`);
});

process.on('warning', (warning) => {
  logger.warn(`Node.js warning: ${warning}`);
});
