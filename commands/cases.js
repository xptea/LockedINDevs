const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const ModerationLog = require('../models/ModerationLog');
const User = require('../models/user');

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

      // Find the user in the database
      const dbUser = await User.findOne({ discordId: user.id });

      if (!dbUser) {
        return interaction.reply({ content: 'User not found in the database.', ephemeral: true });
      }

      // Find all cases for the user
      let cases = await ModerationLog.find({ target: user.user.tag }).sort({ timestamp: -1 });

      // Apply filter if specified
      if (filter) {
        cases = cases.filter(caseEntry => caseEntry.action.toLowerCase() === filter.toLowerCase());
      }

      if (cases.length === 0) {
        return interaction.reply({ content: `No cases found for ${user}.`, ephemeral: true });
      }

      // Count actions
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

      // Pagination variables
      const casesPerPage = 5;
      const totalPages = Math.ceil(cases.length / casesPerPage);
      let currentPage = 0;

      // Function to generate an embed for a specific page
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
          embed.addFields(
            {
              name: `Case ${caseEntry.caseId}`,
              value: `**Action:** ${caseEntry.action}\n**Reason:** ${caseEntry.reason}\n**Proof:** ${caseEntry.proof}\n**Moderator:** ${caseEntry.moderator} (${caseEntry.moderatorId || 'Unknown'})\n**Timestamp:** ${caseEntry.timestamp}`,
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

      // Send the initial embed
      const message = await interaction.reply({ embeds: [generateEmbed(currentPage)], components: [row], ephemeral: true, fetchReply: true });

      // Create a message component collector
      const collector = message.createMessageComponentCollector({ componentType: 'BUTTON', time: 50000 });

      collector.on('collect', async i => {
        try {
          if (i.customId === 'prev' && currentPage > 0) {
            currentPage--;
          } else if (i.customId === 'next' && currentPage < totalPages - 1) {
            currentPage++;
          }

          // Update the embed and buttons
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
          // Delete the message after the collector ends
          await message.delete();
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