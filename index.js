const { Client, Intents, Collection, MessageEmbed } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const mongoose = require('mongoose');
const fs = require('fs');
const config = require('./config.json');
const User = require('./models/user');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_MESSAGE_TYPING,
    Intents.FLAGS.DIRECT_MESSAGES,
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION', 'GUILD_MEMBER', 'USER']
});
client.commands = new Collection();

mongoose.connect(config.mongodbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log('Bot is online!');

  const commands = client.commands.map(command => command.data.toJSON());
  const rest = new REST({ version: '9' }).setToken(config.token);

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1251530293295190056'),
      { body: commands }
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

const LOG_CHANNEL_NAME = 'logs'; 
const ADMIN_USER_ID = '1139185365597573180'; 

client.on('messageDelete', async (message) => {
  if (message.partial) await message.fetch();

  const logChannel = message.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const embed = new MessageEmbed()
    .setTitle('Message Deleted')
    .setColor('#FF0000')
    .addFields(
      { name: 'Author', value: `<@${message.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Message', value: message.content ? message.content : 'No content', inline: false }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });

  if (message.channel.id === logChannel.id) {
    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: 'MESSAGE_DELETE',
      });
      const deletionLog = fetchedLogs.entries.first();
      let executor = 'Unknown';

      if (deletionLog) {
        const { executor: logExecutor, target, extra } = deletionLog;
        if ((target.id === message.author.id) && (extra.channel.id === message.channel.id) && (Date.now() - deletionLog.createdTimestamp < 5000)) {
          executor = logExecutor.tag;
        }
      }

      const adminUser = await client.users.fetch(ADMIN_USER_ID);
      if (adminUser) {
        const dmEmbed = new MessageEmbed()
          .setTitle('Log Message Deleted')
          .setColor('#FF0000')
          .setDescription('A message was deleted from the logs channel')
          .addFields(
            { name: 'Deleted By', value: executor, inline: true },
            { name: 'Author', value: `<@${message.author.id}>`, inline: true },
            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Message', value: message.content ? message.content : 'No content', inline: false }
          )
          .setTimestamp();

        await adminUser.send({ embeds: [dmEmbed] });

        await adminUser.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (oldMessage.partial) await oldMessage.fetch();
  if (newMessage.partial) await newMessage.fetch();
  if (oldMessage.content === newMessage.content) return;

  const logChannel = oldMessage.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const embed = new MessageEmbed()
    .setTitle('Message Edited')
    .setColor('#FFFF00')
    .addFields(
      { name: 'Author', value: `<@${oldMessage.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${oldMessage.channel.id}>`, inline: true },
      { name: 'Old Message', value: oldMessage.content ? oldMessage.content : 'No content', inline: false },
      { name: 'New Message', value: newMessage.content ? newMessage.content : 'No content', inline: false }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

client.on('guildMemberAdd', async (member) => {
  const logChannel = member.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const embed = new MessageEmbed()
    .setTitle('User Joined')
    .setColor('#00FF00')
    .addFields(
      { name: 'User', value: `<@${member.user.id}>`, inline: true },
      { name: 'ID', value: member.user.id, inline: true }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async (member) => {
  const logChannel = member.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const embed = new MessageEmbed()
    .setTitle('User Left')
    .setColor('#FF0000')
    .addFields(
      { name: 'User', value: `<@${member.user.id}>`, inline: true },
      { name: 'ID', value: member.user.id, inline: true }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

client.login(config.token);
