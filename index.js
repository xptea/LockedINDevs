const { Client, Intents, Collection, MessageEmbed } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const mongoose = require('mongoose');
const fs = require('fs');
const moment = require('moment-timezone');
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
  useUnifiedTopology: true
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
      Routes.applicationGuildCommands(client.user.id, config.guildId),
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
    try {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    } catch (err) {
      console.error('Failed to reply to interaction:', err);
    }
  }
});

const LOG_CHANNEL_NAME = 'logs';
const ADMIN_USER_ID = config.adminUserId;

client.on('messageCreate', async message => {
  if (message.channel.id === config.verifyChannelId && !message.content.startsWith('/verify')) {
    try {
      await message.delete();
    } catch (error) {
      if (error.code !== 10008) { // Ignore "Unknown Message" errors
        console.error('Failed to delete message:', error);
      }
    }
  }
});

client.on('messageDelete', async (message) => {
  try {
    if (message.partial) await message.fetch();
    if (message.author.id === client.user.id) return; // Prevent bot from logging its own deletions

    const logChannel = message.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
    if (!logChannel) return;

    const timestamp = moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A');
    const embed = new MessageEmbed()
      .setTitle('Message Deleted')
      .setColor('#FF0000')
      .addFields(
        { name: 'Author', value: `<@${message.author.id}>`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Message', value: message.content ? message.content : 'No content', inline: false },
        { name: 'Timestamp', value: timestamp, inline: false }
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
              { name: 'Message', value: message.content ? message.content : 'No content', inline: false },
              { name: 'Timestamp', value: timestamp, inline: false }
            )
            .setTimestamp();

          await adminUser.send({ embeds: [dmEmbed] });
          await adminUser.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      }
    }
  } catch (error) {
    if (error.code !== 10008) { // Ignore "Unknown Message" errors
      console.error('Failed to handle message delete event:', error);
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (oldMessage.partial) await oldMessage.fetch();
    if (newMessage.partial) await newMessage.fetch();
    if (oldMessage.content === newMessage.content) return;
    if (newMessage.author.id === client.user.id) return; // Prevent bot from logging its own edits

    const logChannel = oldMessage.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
    if (!logChannel) return;

    const timestamp = moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A');
    const embed = new MessageEmbed()
      .setTitle('Message Edited')
      .setColor('#FFFF00')
      .addFields(
        { name: 'Author', value: `<@${oldMessage.author.id}>`, inline: true },
        { name: 'Channel', value: `<#${oldMessage.channel.id}>`, inline: true },
        { name: 'Old Message', value: oldMessage.content ? oldMessage.content : 'No content', inline: false },
        { name: 'New Message', value: newMessage.content ? newMessage.content : 'No content', inline: false },
        { name: 'Timestamp', value: timestamp, inline: false }
      )
      .setTimestamp();

    logChannel.send({ embeds: [embed] });
  } catch (error) {
    if (error.code !== 10008) { // Ignore "Unknown Message" errors
      console.error('Failed to handle message update event:', error);
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  const logChannel = member.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const timestamp = moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A');
  const embed = new MessageEmbed()
    .setTitle('User Joined')
    .setColor('#00FF00')
    .addFields(
      { name: 'User', value: `<@${member.user.id}>`, inline: true },
      { name: 'ID', value: member.user.id, inline: true },
      { name: 'Timestamp', value: timestamp, inline: false }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async (member) => {
  const logChannel = member.guild.channels.cache.find(channel => channel.name === LOG_CHANNEL_NAME && channel.isText());
  if (!logChannel) return;

  const timestamp = moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A');
  const embed = new MessageEmbed()
    .setTitle('User Left')
    .setColor('#FF0000')
    .addFields(
      { name: 'User', value: `<@${member.user.id}>`, inline: true },
      { name: 'ID', value: member.user.id, inline: true },
      { name: 'Timestamp', value: timestamp, inline: false }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

client.login(config.token);