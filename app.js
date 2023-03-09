import 'dotenv/config';
import express from 'express';
import { DateTime } from 'luxon';
import axios from 'axios';
import crypto from 'crypto';
import { Client, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import { VerifyDiscordRequest, getRandomEmoji, DiscordRequest } from './utils.js';
import {
  CHALLENGE_COMMAND,
  TEST_COMMAND,
  HasGuildCommands,
} from './commands.js';
import { Cache } from 'cache.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let channel = null

client.once(Events.ClientReady, c => {
  channel = client.channels.cache.get('1058121514404282428');
  console.log('Ready! Logged in as '+c.user.tag);
  console.log('Currently sending NFT Sales updates in :'+channel)
});

client.login(process.env.DISCORD_TOKEN);


// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" guild command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: 'hello world ' + getRandomEmoji(),
        },
      });
    }
 
  }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  // Check if guild commands from commands.js are installed (if not, install them)
  HasGuildCommands(process.env.APP_ID, process.env.GUILD_ID, [
    TEST_COMMAND,
    CHALLENGE_COMMAND,
  ]);
});

setInterval(() => {
  const lastSaleTime = Cache.get('lastSaleTime', null) || DateTime.now().startOf('minute').minus(59000).toUnixInteger()
  console.log('Last sale (in seconds since Unix epoch): '+Cache.get('lastSaleTime', null));
  
  axios.get('https://api.opensea.io/api/v1/events', {
      headers: {
          'X-API-KEY': process.env.X_API_KEY
      },
      params: {
          collection_slug: process.env.COLLECTION_ADDRESS,
          event_type: 'successful',
          occurred_after: 1677709116,
          only_opensea: 'false'
      }
  }).then((response) => {

    console.log(response)
  
  }).catch((error) => {
      console.error(error);
  });
}, 60000);
