const config = require('../configs/config.json');

module.exports = {
  name: 'permission',
  description: 'Sets command permissions',
  execute(message, args) {
    if (message.author.id !== config.authorizedUserId) {
      return message.reply('You do not have permission to use this command!');
    }

    if (args.length !== 2) {
      return message.reply(`Usage: !${this.name} [module name] [permission level]`);
    }

    const moduleName = args[0];
    const permissionLevel = parseInt(args[1]);

    const module = message.client.modules.get(moduleName);
    if (!module) {
      return message.reply(`Module not found: ${moduleName}`);
    }

    if (isNaN(permissionLevel)) {
      return message.reply('Invalid permission level: must be a number');
    }

    module.permissionLevel = permissionLevel;
    message.reply(`Permission level set to ${permissionLevel} for module ${moduleName}`);
  }
};
