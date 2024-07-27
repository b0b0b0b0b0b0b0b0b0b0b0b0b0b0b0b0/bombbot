const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers
  ],
});

let userData = {};
const filePath = './userData.json';

if (fs.existsSync(filePath)) {
  userData = JSON.parse(fs.readFileSync(filePath));
} else {
  fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
}

function saveUserData() {
  fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
}

function checkCooldown(userId, itemType) {
  const now = Date.now();
  const cooldown = config.items[itemType].cooldown * 1000;

  if (!userData[userId].cooldowns) {
    userData[userId].cooldowns = {};
  }

  if (!userData[userId].cooldowns[itemType] || (now - userData[userId].cooldowns[itemType]) > cooldown) {
    userData[userId].cooldowns[itemType] = now;
    saveUserData();
    return true;
  } else {
    const timeLeft = ((userData[userId].cooldowns[itemType] + cooldown) - now) / 1000;
    return timeLeft;
  }
}

function getBombResult(itemType) {
  const random = Math.random();
  if (random < 0.1) return 'misfire';
  if (random < 0.2) return 'selfDestruct';
  if (random < 0.3) return 'miss';
  if (itemType === 'nuclearBomb' && random < 0.5) return 'massDestruction';
  return 'hit';
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content.startsWith(config.prefix)) {
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'rating') {
      const user = message.mentions.users.first() || message.author;
      const userRating = userData[user.id] !== undefined ? userData[user.id].rating : 0;
      const cooldowns = userData[user.id] !== undefined ? userData[user.id].cooldowns : {};

      let cooldownDescription = '';
      for (const [itemType, lastUsed] of Object.entries(cooldowns)) {
        const item = config.items[itemType];
        if (item) {
          const timeLeft = ((lastUsed + item.cooldown * 1000) - Date.now()) / 1000;
          if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = Math.ceil(timeLeft % 60);
            cooldownDescription += `${item.emoji} - ${minutes} мин. ${seconds} сек.\n`;
          }
        }
      }

      const ratingEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('📊 Рейтинг')
          .setDescription(`У ${user.username}, текущий рейтинг: ${userRating}`)
          .addFields({ name: 'Кулдауны', value: cooldownDescription || 'Нет активных кулдаунов', inline: true })
          .setFooter({ text: `${config.prefix}info - справка` });

      message.reply({ embeds: [ratingEmbed] });
    }



    if (command === 'reset' && message.author.id === config.bobobo) {
      userData = {};
      saveUserData();

      const resetEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('🔄 Сброс рейтингов')
          .setDescription('Все рейтинги были сброшены.')
          .setFooter({ text: `${config.prefix}info - справка` });

      message.reply({ embeds: [resetEmbed] });
    }

    if (command === 'top') {
      const users = Object.entries(userData).sort(([, a], [, b]) => b.rating - a.rating);
      const pageSize = 5;
      let pageIndex = 0;

      const generateTopEmbed = async (page) => {
        const start = page * pageSize;
        const end = start + pageSize;
        const pageUsers = users.slice(start, end);

        const descriptions = await Promise.all(pageUsers.map(async ([id, data], index) => {
          const user = await client.users.fetch(id).catch(() => null);
          const userName = user ? user.username : 'Unknown User';
          return `${start + index + 1}. ${userName} - ${data.rating} очков`;
        }));

        return new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🏆 Топ пользователей')
            .setDescription(descriptions.join('\n') || 'Нет данных для отображения.')
            .setFooter({ text: `Страница ${page + 1} из ${Math.ceil(users.length / pageSize)}` });
      };

      const topEmbed = await generateTopEmbed(pageIndex);
      const row = new ActionRowBuilder()
          .addComponents(
              new ButtonBuilder()
                  .setCustomId('prev')
                  .setLabel('Назад')
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(pageIndex === 0),
              new ButtonBuilder()
                  .setCustomId('next')
                  .setLabel('Вперед')
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(pageIndex === Math.ceil(users.length / pageSize) - 1)
          );

      const messageWithButtons = await message.reply({ embeds: [topEmbed], components: [row] });

      const filter = i => i.customId === 'prev' || i.customId === 'next';
      const collector = messageWithButtons.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

      collector.on('collect', async i => {
        if (!messageWithButtons.editable) {
          collector.stop('message deleted');
          return;
        }

        if (i.customId === 'prev') {
          pageIndex = Math.max(pageIndex - 1, 0);
        } else if (i.customId === 'next') {
          pageIndex = Math.min(pageIndex + 1, Math.ceil(users.length / pageSize) - 1);
        }

        const newEmbed = await generateTopEmbed(pageIndex);
        const newRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Назад')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIndex === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Вперед')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pageIndex === Math.ceil(users.length / pageSize) - 1)
            );

        await i.update({ embeds: [newEmbed], components: [newRow] });
      });

      collector.on('end', collected => {
        if (messageWithButtons.editable) {
          messageWithButtons.edit({ components: [] });
        }
      });
    }


    if (command === 'info') {
      const itemEntries = Object.entries(config.items);

      const chunkSize = 5;
      const itemChunks = [];
      for (let i = 0; i < itemEntries.length; i += chunkSize) {
        itemChunks.push(itemEntries.slice(i, i + chunkSize));
      }

      const infoEmbed = new EmbedBuilder()
          .setColor(0x097c83)
          .setTitle('ℹ️ Информация')
          .setDescription(
              'Бот позволяет бросать бомбы и дарить подарки, чтобы изменить рейтинги пользователей. Просто упомяните другого пользователя на сервере и отправьте один из смайликов, представленных ниже. Бот сделает всё остальное!\n\n' +
              '**Вот список команд:**'
          )
          .addFields(
              { name: `${config.prefix}rating [пользователь]`, value: 'Показать текущий рейтинг пользователя.' },
              { name: `${config.prefix}top`, value: 'Показать топ 10 пользователей по рейтингу.' },
              { name: `${config.prefix}info`, value: 'Показать информацию о боте и список команд.' }
          )
          .setFooter({ text: 'Используйте снаряды с умом и получайте удовольствие!' });

      itemChunks.forEach((chunk, index) => {
        let chunkDescription = '';
        chunk.forEach(([type, item]) => {
          const minutes = Math.floor(item.cooldown / 60);
          const seconds = item.cooldown % 60;
          const cooldownString = `${minutes} мин. ${seconds} сек.`;
          chunkDescription += `${item.emoji} - ${item.description || 'Нет описания'}\nКулдаун: ${cooldownString}\n\n`;
        });
        infoEmbed.addFields({ name: `Доступные снаряды (часть ${index + 1})`, value: chunkDescription });
      });

      message.reply({ embeds: [infoEmbed] });
    }



  }

  if (message.channel.id === config.channelId) {
    const sender = message.author;

    if (!userData[sender.id]) {
      userData[sender.id] = { rating: 0, cooldowns: {} };
    }

    let itemType = null;
    let mentionedUser = null;
    if (message.reference) {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (!referencedMessage.author.bot) {
        mentionedUser = referencedMessage.author;
        for (const [type, item] of Object.entries(config.items)) {
          if (message.content.includes(item.emoji)) {
            itemType = type;
            break;
          }
        }
      }
    } else {
      for (const [type, item] of Object.entries(config.items)) {
        if (message.content.includes(item.emoji)) {
          itemType = type;
          break;
        }
      }
      if (message.mentions.users.size > 0) {
        mentionedUser = message.mentions.users.first();
      }
    }

    if (itemType) {
      const item = config.items[itemType];

      if (item.requiresMention && !mentionedUser) {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Ошибка')
            .setDescription('Ты должен упомянуть одного пользователя для использования этого предмета.')
            .setFooter({ text: `${config.prefix}info - справка` });
        message.reply({ embeds: [embed] });
        return;
      }

      if (mentionedUser && mentionedUser.bot && itemType !== 'gift') {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Ошибка')
            .setDescription('Ты на кого пасть разинул, пупсик? Атаковать меня вздумал? Минус 10 рейтинга тебе.')
            .setFooter({ text: `${config.prefix}info - справка` });
        userData[sender.id].rating = Math.max(0, userData[sender.id].rating - 10);
        saveUserData();
        message.reply({ embeds: [embed] });
        return;
      } else if (mentionedUser && mentionedUser.bot && itemType === 'gift') {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Подарок мне?')
            .setDescription('А мне не нужны подарки! Спасибо')
            .setFooter({ text: `${config.prefix}info - справка` });
        message.reply({ embeds: [embed] });
        return;
      }

      const cooldownCheck = checkCooldown(sender.id, itemType);
      if (cooldownCheck === true) {
        if (itemType === 'gift' && mentionedUser) {
          if (!userData[mentionedUser.id]) {
            userData[mentionedUser.id] = { rating: 0, cooldowns: {} };
          }

          if (sender.id === mentionedUser.id) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('Хех... А ты пупс харош!')
                .setDescription('Ты не можешь подарить подарок самому себе.\н А кулдаун на подарок я тебе накинул... будешь знать, как хернёй страдать 😏')
                .setFooter({ text: `${config.prefix}info - справка` });

            userData[sender.id].cooldowns['gift'] = Date.now();
            saveUserData();

            message.reply({ embeds: [embed] });
            return;
          }

          userData[mentionedUser.id].rating += 10;
          userData[sender.id].rating += 10;

          saveUserData();

          const giftEmbed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle('🎁 Подарок!')
              .setDescription(`${sender.username} подарил ${item.emoji} ${mentionedUser.username}! Оба получили по 10 очков.`)
              .addFields(
                  { name: `${mentionedUser.username}`, value: `Рейтинг: ${userData[mentionedUser.id].rating}`, inline: true },
                  { name: `${sender.username}`, value: `Рейтинг: ${userData[sender.id].rating}`, inline: true }
              )
              .setFooter({ text: `${config.prefix}info - справка` });

          message.reply({ embeds: [giftEmbed] });
        } else if (mentionedUser) {
          if (!userData[mentionedUser.id]) {
            userData[mentionedUser.id] = { rating: 0, cooldowns: {} };
          }

          const bombResult = getBombResult(itemType);
          let description = '';
          let fields = [];

          if (mentionedUser.id === sender.id && message.content.includes('💣')) {
            userData[sender.id].rating = 0;

            description = `💣 Самоподрыв! ${sender.username} попытался бросить бомбу в самого себя и полностью обнулил свой рейтинг. Теперь его рейтинг равен 0.`;
            fields = [
              { name: `${sender.username}`, value: `Рейтинг: ${userData[sender.id].rating}`, inline: true },
            ];

          } else {
            switch (bombResult) {
              case 'misfire':
                description = `Осечка! ${sender.username} попытался бросить бомбу, но она не сработала.`;
                break;
              case 'selfDestruct':
                userData[sender.id].rating -= item.points;
                description = `💥 Самоподрыв! ${sender.username} попытался бросить бомбу, но она взорвалась у него в руках. Он потерял ${item.points} очков.`;
                fields = [
                  { name: `${sender.username}`, value: `Рейтинг: ${userData[sender.id].rating}`, inline: true },
                ];
                break;
              case 'miss':
                description = `Промах! ${sender.username} попытался бросить бомбу в ${mentionedUser.username}, но промахнулся. Никто не потерял очков.`;
                break;
              case 'massDestruction':
                Object.keys(userData).forEach(id => {
                  if (id !== sender.id && id !== mentionedUser.id) {
                    userData[id].rating = Math.max(0, userData[id].rating - item.points);
                  }
                });
                description = `💥 Массовое уничтожение! ${sender.username} использовал ядерную бомбу, нанеся ${item.points} очков урона всем на сервере!`;
                fields = Object.entries(userData).map(([id, data]) => ({ name: `${id}`, value: `Рейтинг: ${data.rating}`, inline: true }));
                break;
              case 'hit':
              default:
                userData[mentionedUser.id].rating -= item.points;
                userData[sender.id].rating += item.points;
                description = `💣 Попадание! ${sender.username} бросил ${item.emoji} в ${mentionedUser.username}.`;
                fields = [
                  { name: `${mentionedUser.username}`, value: `Рейтинг: ${userData[mentionedUser.id].rating}`, inline: true },
                  { name: `${sender.username}`, value: `Рейтинг: ${userData[sender.id].rating}`, inline: true }
                ];
                break;
            }
          }

          saveUserData();

          const bombEmbed = new EmbedBuilder()
              .setColor(0x1ed512)
              .setTitle('Результат броска бомбы')
              .setDescription(description)
              .addFields(fields)
              .setFooter({ text: `${config.prefix}info - справка` });

          message.reply({ embeds: [bombEmbed] });
        } else {
          const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle('Ошибка')
              .setDescription('Ты должен упомянуть одного пользователя для использования этого предмета.')
              .setFooter({ text: `${config.prefix}info - справка` });
          message.reply({ embeds: [embed] });
        }
      } else {
        const minutes = Math.floor(cooldownCheck / 60);
        const seconds = Math.ceil(cooldownCheck % 60);

        const timeString = `${minutes} мин. ${seconds} сек.`;

        const cooldownEmbed = new EmbedBuilder()
            .setColor(0x7e1075)
            .setTitle('⏳ Кулдаун')
            .setDescription(`Подожди ${timeString}, чтобы повторно использвать ${config.items[itemType].emoji}`)
            .setFooter({ text: `${config.prefix}info - справка` });

        message.reply({ embeds: [cooldownEmbed] });
      }

    }
  }
});
client.login(config.token);
