const Discord = require('discord.js');
const { Manager } = require('lavacord');
const ytdl = require('ytdl-core-discord');
const ytsr = require('ytsr');
const ytpl = require('ytpl');
const Spotify = require('spotify-web-api-node');
const Soundcloud = require('soundcloud-scraper').default;
const fs = require('fs');
const path = require('path');

const dependencies = [
  'discord.js',
  'lavacord',
  'ytdl-core-discord',
  'ytsr',
  'ytpl',
  'spotify-web-api-node',
  'soundcloud-scraper',
  'node-fetch'
];

module.exports = {
  name: 'music',
  description: 'Plays music within a Voice Channel.',
  execute(message, args) {
    const configFilePath = path.join(__dirname, 'configs', 'music_config.json');
    let config;
    
    if (!fs.existsSync(configFilePath)) {
      console.log('Music module config file not found. Creating new file with default values...');
    
      config = {
        prefix: '!',
        maxQueueLength: 20,
        spotifyClientId: '',
        spotifyClientSecret: '',
        soundcloudClientId: '',
        defaultSearchType: 'ytsearch',
        nodes: [
          { id: '1', host: 'localhost', port: 2333, password: 'youshallnotpass' }
        ]
      };
    
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    } else {
      config = JSON.parse(fs.readFileSync(configFilePath));
    }
    
    const manager = new Manager(config.nodes, {
      user: client.user.id,
      shards: shardCount,
      send: (packet) => {
        const guild = client.guilds.cache.get(packet.d.guild_id);
        if (guild) guild.shard.send(packet);
      }
    });
    
    manager.connect();
    
    const spotify = new Spotify({
      clientId: config.spotifyClientId,
      clientSecret: config.spotifyClientSecret
    });
    
    const soundcloud = new Soundcloud({
      clientId: config.soundcloudClientId
    });
    
    const queue = new Map();
    let playing = false;
    
    async function playTrack(track, message) {
      const { title, author, duration, uri, identifier } = track;
    
      const player = manager.create({
        guild: message.guild.id,
        voiceChannel: message.member.voice.channel.id,
        textChannel: message.channel.id
      });
    
      player.connect();
    
      await player.play(track.track);
    
      const embed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Now Playing')
        .setDescription(`[${title}](${uri})`)
        .addFields(
          { name: 'Author', value: author },
          { name: 'Duration', value: `${duration}ms` }
        )
        .setTimestamp();
    
      await message.channel.send({ embeds: [embed] });
    
      player.once('end', async (data) => {
        const { reason } = data;
    
        if (reason === 'REPLACED') return;
    
        if (queue.get(message.guild.id).length > 0) {
          const nextTrack = queue.get(message.guild.id).shift();
          await playTrack(nextTrack, message);
        } else {
          playing = false;
          await message.channel.send('There are no more tracks in the queue. Leaving voice channel.');
          manager.leave(message.guild.id);
        }
      });
    
      player.once('error', async (error) => {
        await message.channel.send(`An error occurred while playing the track: ${error}`);
      });
    
      player.once('stuck', async () => {
        await message.channel.send('The player got stuck while playing the track. Skipping to next track...');
        player.stop();
      });
    }
    
    async function search(query, searchType) {
        const node = manager.idealNodes[0];
        const params = new URLSearchParams();
        params.append("identifier", `${searchType}:${query}`);
      
        return fetch(`http://${node.host}:${node.port}/loadtracks?${params}`, {
          headers: { Authorization: node.password }
        })
          .then(res => res.json())
          .then(data => data.tracks)
          .catch(err => {
            console.error(err);
            return null;
          });
      }
      
      // Play track from URL or search query
      async function playTrack(searchQuery, message) {
        const node = manager.idealNodes[0];
        const searchResult = await search(searchQuery, "ytsearch");
        if (!searchResult || !searchResult.length) {
          await message.channel.send(`No results found for query: ${searchQuery}`);
          return;
        }
      
        if (!player) {
          player = manager.join({
            guild: message.guild.id,
            channel: message.member.voice.channel.id,
            node: node.id
          });
        }
      
        const track = searchResult[0];
        if (player.playing) {
          queue.push(track);
          await message.channel.send(`Added **${track.info.title}** to the queue.`);
        } else {
          await player.play(track.track);
          await message.channel.send(`Now playing **${track.info.title}**.`);
        }
      }
      
      client.on("messageCreate", async message => {
        if (message.author.bot || !message.content.startsWith(PREFIX)) return;
      
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
      
        if (command === "play") {
          if (!message.member.voice.channel) {
            await message.channel.send("You must be in a voice channel to play music!");
            return;
          }
      
          const query = args.join(" ");
          await playTrack(query, message);
        } else if (command === "skip") {
          if (!player || !player.playing) {
            await message.channel.send("There is no song to skip!");
            return;
          }
      
          player.stop();
          await message.channel.send("Skipped the current song.");
        } else if (command === "pause") {
          if (!player || !player.playing) {
            await message.channel.send("There is no song to pause!");
            return;
          }
      
          player.pause();
          await message.channel.send("Paused the current song.");
        } else if (command === "resume") {
          if (!player || !player.paused) {
            await message.channel.send("There is no song to resume!");
            return;
          }
      
          player.resume();
          await message.channel.send("Resumed the current song.");
        } else if (command === "queue") {
          if (!player || !player.playing || !queue.length) {
            await message.channel.send("There are no songs in the queue!");
            return;
          }
      
          const queueList = queue.map((track, index) => {
            return `${index + 1}. **${track.info.title}**`;
          }).join("\n");
          await message.channel.send(`__**Music Queue:**__\n${queueList}`);
        }
      });
        },
  dependencies: [
    'discord.js',
    'lavacord',
    'ytdl-core-discord',
    'ytsr',
    'ytpl',
    'spotify-web-api-node',
    'soundcloud-scraper',
    'node-fetch'
  ]
};
