import { Message } from 'discord.js';
import fs from 'fs';
import { EmbedBuilder } from '@discordjs/builders';

export const handleLinksCommand = (message: Message) => {
  const templateContent = fs.readFileSync('message_template.json', 'utf8');
  const linksContent = fs.readFileSync('nacho_links.json', 'utf8');

  const template = JSON.parse(templateContent);
  const linksJson = JSON.parse(linksContent);

  const embed = new EmbedBuilder()
    .setColor(template.color)
    .setImage(template.background_images[0].url)
    .setAuthor({ name: template.author.name, iconURL: template.author.icon_url })
    .setFooter({ text: 'x.com/NachoWyborski' })
    .setTitle('Official Links');

  linksJson.links.forEach((link: { name: string; url: string }) => {
    embed.addFields({ name: link.name, value: link.url });
  });

  message.channel.send({ embeds: [embed] });
};
