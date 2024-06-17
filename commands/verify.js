const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const noblox = require('noblox.js');
const User = require('../models/user');

function generateRandomPhrase() {
  const words = ["apple", "banana", "carrot", "cat", "house", "flower", "giraffe"];
  return `${words[Math.floor(Math.random() * words.length)]}-${words[Math.floor(Math.random() * words.length)]}-${words[Math.floor(Math.random() * words.length)]}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Roblox account')
    .addStringOption(option => 
      option.setName('username')
        .setDescription('Your Roblox username')
        .setRequired(true)),
  async execute(interaction) {
    const username = interaction.options.getString('username');

    try {
      const userId = await noblox.getIdFromUsername(username);
      const userInfo = await noblox.getPlayerInfo(userId);

      // Check if the Roblox ID is already verified
      const existingUser = await User.findOne({ robloxId: userId });
      if (existingUser) {
        // Notify the user they are already verified and assign the member role
        const memberRole = interaction.guild.roles.cache.get('1251654234059833494');
        if (memberRole) {
          await interaction.member.roles.add(memberRole).catch(console.error);
        }
        return interaction.reply({ content: `<@${interaction.user.id}>, you have already been verified as **${existingUser.robloxUsername}** and have been assigned the member role.`, ephemeral: true });
      }

      const randomPhrase = generateRandomPhrase();
      const embed = new MessageEmbed()
        .setTitle('Roblox Account Verification')
        .setDescription(`To verify your Roblox account, please update your Roblox bio with the following phrase:\n\n**${randomPhrase}**\n\nOnce you have updated your bio, click the "Check Verification" button below.`)
        .setColor('#00AAFF')
        .setFooter({ text: 'Roblox Verification' });

      const row = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setCustomId('check_verification')
            .setLabel('Check Verification')
            .setStyle('PRIMARY'),
          new MessageButton()
            .setCustomId('new_phrase')
            .setLabel('New Phrase')
            .setStyle('SECONDARY'),
        );

      // Send a private reply
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

      const filter = i => (i.customId === 'check_verification' || i.customId === 'new_phrase') && i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        if (i.customId === 'check_verification') {
          try {
            const profile = await noblox.getPlayerInfo(userId);
            if (profile.blurb.includes(randomPhrase)) {
              const joinTimestamp = new Date();
              const newUser = new User({
                discordId: interaction.user.id,
                robloxId: userId,
                robloxUsername: userInfo.username,
                joinDate: joinTimestamp
              });
              await newUser.save();
      
              // Assign the member roles
              const memberRole = interaction.guild.roles.cache.get('1251654234059833494');

              if (memberRole) {
                await interaction.member.roles.add(memberRole).catch(console.error);
              }
      
              // Find the logs channel
              const logsChannel = interaction.guild.channels.cache.find(channel => channel.name === 'logs');
              if (logsChannel) {
                // Format the date to a readable format
                const verificationTime = joinTimestamp.toLocaleString('en-US', { timeZone: 'America/New_York' });
      
                // Send an embed to the logs channel
                const verificationLogEmbed = new MessageEmbed()
                  .setTitle('User Verification Log')
                  .setDescription(`**Discord User:** ${interaction.user.tag}\n**Roblox Username:** ${userInfo.username}\n**Roblox ID:** ${userId}\n**Time:** ${verificationTime}`)
                  .setColor('#00AAFF');
                logsChannel.send({ embeds: [verificationLogEmbed] }).catch(console.error);
              }
      
              await i.update({ content: `Successfully verified as ${userInfo.username} (ID: ${userId}) and assigned the member role.`, embeds: [], components: [] });
            } else {
              await i.update({ content: 'Bio verification failed. Please make sure your Roblox bio contains the correct phrase.', embeds: [], components: [] });
            }
          } catch (error) {
            console.error('Error checking verification:', error);
            await i.update({ content: 'Error checking verification. Please try again later.', embeds: [], components: [] });
          }
        } else if (i.customId === 'new_phrase') {
          const newPhrase = generateRandomPhrase();
          const newEmbed = new MessageEmbed()
            .setTitle('Roblox Account Verification')
            .setDescription(`To verify your Roblox account, please update your Roblox bio with the following phrase:\n\n**${newPhrase}**\n\nOnce you have updated your bio, click the "Check Verification" button below.`)
            .setColor('#00AAFF')
            .setFooter({ text: 'Roblox Verification' });
          await i.update({ embeds: [newEmbed], components: [row] });
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({ content: 'Verification process timed out.', embeds: [], components: [] });
        }
      });

    } catch (error) {
      console.error('Error during verification process:', error);
      await interaction.reply({ content: 'Could not verify the Roblox account due to an error. Please try again later.', ephemeral: true });
    }
  },
};