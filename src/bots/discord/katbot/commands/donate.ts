import { Message } from 'discord.js';
import fs from 'fs';
import { EmbedBuilder } from '@discordjs/builders';

export const handleDonateCommand = (message: Message) => {
  const templateContent = fs.readFileSync('message_template.json', 'utf8');
  const template = JSON.parse(templateContent);

  const embed = new EmbedBuilder()
    .setColor(template.color)
    .setImage(template.background_images[0].url)
    .setAuthor({ name: template.author.name, iconURL: template.author.icon_url })
    .setFooter({ text: 'x.com/NachoWyborski' })
    .addFields({ name: 'Donation Address', value: 'kaspa:qrt3lf6jejjdzwtnvlr3z35w7j6q66gt49a7grdwsq98nmlg5uz97whuf8qfr' })
    .setDescription('[Check Kaspa Donation Wallet Balance](https://kas.fyi/address/kaspa:qrt3lf6jejjdzwtnvlr3z35w7j6q66gt49a7grdwsq98nmlg5uz97whuf8qfr)');

  message.channel.send({ embeds: [embed] });
};
