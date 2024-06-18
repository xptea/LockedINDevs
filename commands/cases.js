const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const ModerationLog = require('../models/ModerationLog');
const User = require('../models/user');
const moment = require('moment-timezone');

const MAX_RETRIES = 3;

async function deleteMessageWithRetries(message, retries = MAX_RETRIES) {
  try {
    await message.delete();
    console.log('Message deleted successfully.');
  } catch (error) {
    if (retries > 0) {
      console.warn(`Failed to delete message. Retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
      return deleteMessageWithRetries(message, retries - 1);
    } else {
      console.error('Failed to delete message after multiple attempts:', error);
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cases')
    .setDescription('Manage moderation cases')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all cases for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The Discord user to check')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('filter')
            .setDescription('Filter by action type (timeout, ban, kick, warn)')
            .setRequired(false))),
  async execute(interaction) {
    try {
      const user = interaction.options.getMember('user');
      const filter = interaction.options.getString('filter');

      if (!user) {
        return interaction.reply({ content: 'User not found in the server.', ephemeral: true });
      }

      const dbUser = await User.findOne({ discordId: user.id });

      if (!dbUser) {
        return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
      }

      let cases = await ModerationLog.find({ target: user.user.tag }).sort({ timestamp: -1 });

      if (filter) {
        cases = cases.filter(caseEntry => caseEntry.action.toLowerCase() === filter.toLowerCase());
      }

      if (cases.length === 0) {
        return interaction.reply({ content: `No cases found for ${user}.`, ephemeral: true });
      }

      const counts = {
        ban: 0,
        kick: 0,
        warn: 0,
        timeout: 0,
      };

      cases.forEach(caseEntry => {
        const action = caseEntry.action.toLowerCase();
        if (counts[action] !== undefined) {
          counts[action]++;
        }
      });

      const casesPerPage = 5;
      const totalPages = Math.ceil(cases.length / casesPerPage);
      let currentPage = 0;

      const generateEmbed = (page) => {
        const start = page * casesPerPage;
        const end = start + casesPerPage;
        const currentCases = cases.slice(start, end);

        const embed = new MessageEmbed()
          .setTitle(`Cases for ${user.user.tag}`)
          .setColor('#ff0000')
          .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
          .addFields(
            { name: 'Summary', value: `Total: ${cases.length} | Bans: ${counts.ban} | Kicks: ${counts.kick} | Warns: ${counts.warn} | Timeouts: ${counts.timeout}`, inline: false }
          );

        currentCases.forEach(caseEntry => {
          const timestamp = moment(caseEntry.timestamp, 'DD/MM/YYYY hh:mm A').tz('America/New_York').format('DD/MM/YYYY hh:mm A');
          embed.addFields(
            {
              name: `Case ${caseEntry.caseId}`,
              value: `**Action:** ${caseEntry.action}\n**Reason:** ${caseEntry.reason}\n**Proof:** ${caseEntry.proof}\n**Moderator:** ${caseEntry.moderator} (${caseEntry.moderatorId || 'Unknown'})\n**Timestamp:** ${timestamp}`,
              inline: false
            }
          );
        });

        return embed;
      };

      const row = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setCustomId('prev')
            .setLabel('Previous')
            .setStyle('SECONDARY')
            .setDisabled(currentPage === 0),
          new MessageButton()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle('SECONDARY')
            .setDisabled(currentPage === totalPages - 1)
        );

      const message = await interaction.reply({ embeds: [generateEmbed(currentPage)], components: [row], ephemeral: true, fetchReply: true });
      const collector = message.createMessageComponentCollector({ componentType: 'BUTTON', time: 50000 });

      collector.on('collect', async i => {
        try {
          if (i.customId === 'prev' && currentPage > 0) {
            currentPage--;
          } else if (i.customId === 'next' && currentPage < totalPages - 1) {
            currentPage++;
          }

          await i.update({
            embeds: [generateEmbed(currentPage)],
            components: [
              new MessageActionRow().addComponents(
                new MessageButton()
                  .setCustomId('prev')
                  .setLabel('Previous')
                  .setStyle('SECONDARY')
                  .setDisabled(currentPage === 0),
                new MessageButton()
                  .setCustomId('next')
                  .setLabel('Next')
                  .setStyle('SECONDARY')
                  .setDisabled(currentPage === totalPages - 1)
              ),
            ],
          });
        } catch (error) {
          console.error('An error occurred while updating the embed:', error);
          try {
            await i.reply({ content: 'An error occurred while updating the embed. Please try again later.', ephemeral: true });
          } catch (err) {
            console.error('Failed to reply to interaction:', err);
          }
        }
      });

      collector.on('end', async collected => {
        try {
          await deleteMessageWithRetries(message);
        } catch (error) {
          console.error('An error occurred while deleting the message:', error);
        }
      });

    } catch (error) {
      console.error('An error occurred while processing the command:', error);
      try {
        await interaction.reply({ content: 'An error occurred while processing the command. Please try again later.', ephemeral: true });
      } catch (err) {
        console.error('Failed to reply to interaction:', err);
      }
    }
  },
};
