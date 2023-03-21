// ./modules/config.js

const fs = require('fs');
const Discord = require('discord.js');

module.exports = {
  name: 'config',
  description: 'Allows the bot owner to edit the configuration file',
  execute(message, args) {
    if (message.author.id !== process.env.BOT_OWNER_ID) {
      return message.channel.send('You are not authorized to use this command.');
    }

    const command = args.shift().toLowerCase();

    switch (command) {
      case 'get':
        const config = require('../config.json');
        const embed = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('Current Configuration')
          .setDescription('```' + JSON.stringify(config, null, 2) + '```')
          .setTimestamp();
        message.channel.send(embed);
        break;

      case 'set':
        const key = args[0];
        const value = args[1];
        if (!key || !value) {
          return message.channel.send('Usage: !config set <key> <value>');
        }
        const configData = require('../config.json');
        configData[key] = value;
        fs.writeFileSync('./config.json', JSON.stringify(configData, null, 2));
        message.channel.send(`Configuration key '${key}' set to '${value}'.`);
        break;

      default:
        message.channel.send('Usage: !config [get|set]');
    }
  }
};

module.exports = {
  name: 'prefix',
  description: 'Changes the bot prefix',
  execute(message, args) {
    if (message.author.id !== message.guild.ownerID) {
      return message.channel.send('You are not authorized to use this command.');
    }

    const newPrefix = args[0];
    if (!newPrefix) {
      return message.channel.send(`The current prefix is '${process.env.PREFIX}'.`);
    }

    process.env.PREFIX = newPrefix;
    fs.writeFileSync('./.env', `PREFIX=${newPrefix}`);

    message.channel.send(`Prefix changed to '${newPrefix}'.`);
  }
};
