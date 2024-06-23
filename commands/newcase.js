const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js');
const ModerationLog = require('../models/ModerationLog');
const User = require('../models/user');
const moment = require('moment-timezone');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newcase')
    .setDescription('Create a new moderation case')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The Discord user to take action against')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the moderation action')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Evidence or proof of the action')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Duration (e.g., 10m for 10 minutes, 10d for 10 days)')
        .setRequired(false)),
  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const user = interaction.options.getMember('user');
    const proof = interaction.options.getString('proof') || 'No proof provided';
    const reason = interaction.options.getString('reason');
    const timeInput = interaction.options.getString('time');

    let timeInMinutes = null;
    if (timeInput) {
      const timePattern = /^(\d+)([md])$/;
      const match = timeInput.match(timePattern);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'm') {
          timeInMinutes = value;
        } else if (unit === 'd') {
          timeInMinutes = value * 1440;
        }
      }
    }

    try {
      const dbUser = await User.findOne({ discordId: user.id });

      if (!dbUser) {
        return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
      }

      let caseId;
      let isUnique = false;
      while (!isUnique) {
        caseId = Math.floor(Math.random() * 1000000);
        const existingCase = await ModerationLog.findOne({ caseId: caseId });
        if (!existingCase) {
          isUnique = true;
        }
      }

      let embed = new MessageEmbed()
        .setTitle(`Case ${caseId}`)
        .setDescription(`**User:** ${user}\n**Proof:** ${proof}\n**Reason:** ${reason}`)
        .setColor('#ff0000')
        .addFields(
          { name: 'Action', value: 'Choose an action:', inline: true },
          { name: 'Time', value: timeInput || 'No time specified', inline: true }
        );

      const row = new MessageActionRow()
        .addComponents(
          new MessageSelectMenu()
            .setCustomId(`select_${caseId}`)
            .setPlaceholder('Select an action')
            .addOptions([
              {
                label: 'Kick',
                value: 'kick',
                description: 'Kick the user',
              },
              {
                label: 'Ban',
                value: 'ban',
                description: 'Ban the user',
              },
              {
                label: 'Warn',
                value: 'warn',
                description: 'Warn the user',
              },
              {
                label: 'Timeout',
                value: 'timeout',
                description: 'Timeout the user',
              },
            ])
        );

      const rowSubmit = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setCustomId(`submit_${caseId}`)
            .setLabel('Submit')
            .setStyle('PRIMARY'),
        );

      await interaction.reply({ content: 'New case created. Select an action:', embeds: [embed], components: [row, rowSubmit], fetchReply: true });

      const collector = interaction.channel.createMessageComponentCollector({ componentType: 'SELECT_MENU', time: 60000 });

      collector.on('collect', async i => {
        if (i.customId === `select_${caseId}`) {
          const value = i.values[0];
          embed.fields.find(field => field.name === 'Action').value = `${value}`;
          await i.update({ embeds: [embed], components: [row, rowSubmit] });
        }
      });

      const buttonCollector = interaction.channel.createMessageComponentCollector({ componentType: 'BUTTON', time: 60000 });

      buttonCollector.on('collect', async i => {
        if (i.customId === `submit_${caseId}`) {
          const action = embed.fields.find(field => field.name === 'Action').value;
          let actionTaken = false;

          if (!action) {
            await i.update({ content: 'Please select an action before submitting.', embeds: [embed], components: [row, rowSubmit] });
            return;
          }

          try {
            switch (action) {
              case 'kick':
                await user.kick(reason);
                actionTaken = true;
                break;
              case 'ban':
                const banOptions = timeInMinutes ? { days: timeInMinutes / 1440, reason } : { reason };
                await user.ban(banOptions);
                actionTaken = true;
                break;
              case 'warn':
                actionTaken = true;
                break;
              case 'timeout':
                if (!timeInMinutes) {
                  await i.update({ content: 'Please specify the duration for the timeout (e.g., 10m for 10 minutes).', embeds: [embed], components: [row, rowSubmit] });
                  return;
                }
                await user.timeout(timeInMinutes * 60 * 1000, reason);
                actionTaken = true;
                break;
            }

            if (actionTaken) {
              const timestamp = moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A');
              await i.update({ content: `Action '${action}' performed.`, embeds: [], components: [], ephemeral: true });
              const logEntry = new ModerationLog({
                caseId: caseId,
                moderator: i.user.tag,
                moderatorId: i.user.id,
                action: action,
                target: user.user.tag,
                reason: reason,
                proof: proof,
                timestamp: timestamp
              });
              await logEntry.save();

              const logsChannel = interaction.guild.channels.cache.find(channel => channel.name === 'logs' && channel.type === 'GUILD_TEXT');
              if (logsChannel) {
                const logEmbed = new MessageEmbed()
                  .setTitle(`Case ${caseId}`)
                  .setColor('#ff0000')
                  .addFields(
                    { name: 'Action', value: action, inline: true },
                    { name: 'User', value: user.user.tag, inline: true },
                    { name: 'User ID', value: user.user.id, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Moderator ID', value: interaction.user.id, inline: true },
                    { name: 'Reason', value: reason },
                    { name: 'Proof', value: proof },
                    { name: 'Time', value: timeInput || 'No time specified' },
                    { name: 'Timestamp', value: timestamp }
                  )
                  .setTimestamp();
                await logsChannel.send({ embeds: [logEmbed] });
              }
            }
          } catch (error) {
            console.error(`Failed to ${action} user:`, error);
            await i.update({ content: `Failed to ${action} user. Please check my permissions and try again.`, embeds: [], components: [], ephemeral: true });
          }
        }
      });
    } catch (error) {
      console.error('An error occurred while processing the command:', error);
      await interaction.reply({ content: 'An error occurred while processing the command. Please try again later.', ephemeral: true });
    }
  },
};
