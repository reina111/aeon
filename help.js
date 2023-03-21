// ./modules/help.js

const Discord = require('discord.js');

module.exports = {
  name: 'help',
  description: 'Displays a list of available commands',
  execute(message, args) {
    const embeds = [];
    const commandsByModule = {};

    // Sort commands by module
    message.client.commands.forEach(command => {
      const moduleName = command.module || 'Uncategorized';
      if (!commandsByModule[moduleName]) {
        commandsByModule[moduleName] = [];
      }
      commandsByModule[moduleName].push(command);
    });

    // Create embeds for each module
    Object.entries(commandsByModule).forEach(([moduleName, commands]) => {
      const embed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle(`${moduleName} Commands`)
        .setDescription(commands.map(command => `**!${command.name}** - ${command.description}`).join('\n'))
        .setTimestamp();
      embeds.push(embed);
    });

    // Send embeds
    const channel = message.channel;
    channel.send(embeds[0]).then(async () => {
      for (let i = 1; i < embeds.length; i++) {
        await channel.send(embeds[i]);
      }
    });
  }
}
