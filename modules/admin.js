// ./modules/admin.js
const { spawn } = require('child_process');
const config = require('../config.json');

module.exports = {
  name: 'admin',
  description: 'Commands for bot administration',
  async execute(message, args) {
    if (message.author.id !== config.authorizedUserId) {
      return message.reply('You do not have permission to use this command!');
    }

    switch (args[0]) {
      case 'restart':
        message.reply('Restarting bot...');
        await restartBot();
        break;
      case 'stop':
        message.reply('Stopping bot...');
        await stopBot();
        break;
      case 'status':
        const status = getBotStatus();
        message.reply(`Bot status: ${status}`);
        break;
      default:
        message.reply(`Available commands: !${this.name} restart|stop|status`);
        break;
    }
  }
};

async function restartBot() {
  console.log('Restarting bot...');
  const botProcess = spawn(process.argv[0], process.argv.slice(1), { detached: true, stdio: 'ignore' });
  botProcess.unref();
  process.exit();
}

async function stopBot() {
  console.log('Stopping bot...');
  await client.destroy();
  process.exit();
}


function getBotStatus() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor(uptime % 86400 / 3600);
  const minutes = Math.floor(uptime % 3600 / 60);
  const seconds = Math.floor(uptime % 60);

  const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  const status = {
    uptime: uptimeStr,
    memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    version: process.version,
    nodeMemoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
    cpuUsage: `${Math.round(process.cpuUsage().user / 1000)}ms / ${Math.round(process.cpuUsage().system / 1000)}ms`
  };

  return status;
}
