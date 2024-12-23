import { Message, EmbedBuilder } from 'discord.js';

export const handleHelpCommand = (message: Message) => {
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Kat Bot - Command Guide')
    .setDescription('Here are the available commands:')
    .addFields(
      { name: '!status <TICKER>', value: 'Get token info for a specific ticker on Mainnet.' },
      { name: '!balance <WALLET_ADDRESS>', value: 'Check KRC20 token balances for a wallet on Mainnet.' },
      { name: '!links', value: 'Get official Nacho the 𐤊at community links.' },
      { name: '!donate', value: 'View donation information for the Nacho the 𐤊at Community.' },
      { name: '!helpmenu', value: 'Display this help menu.' }
    )
    .setFooter({ 
      text: 'Built with ❤️ by the Nacho the 𐤊at Community', 
      iconURL: 'https://media.discordapp.net/attachments/1262092990273294458/1278406148235460709/NACHO_best_final.png?ex=66d0b001&is=66cf5e81&hm=0b93b66600c0b2f4b1146bedca819ef85c198f4a5dc9999ec1842d22cecf0c94&=&format=webp&quality=lossless' 
    })
    .setTimestamp();

  message.channel.send({ embeds: [embed] });
};