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
import { CHALLENGE_COMMAND, TEST_COMMAND, HasGuildCommands } from './commands.js';
import cache from './cache.js';
import _ from 'lodash';
import { ethers } from 'ethers';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let channel = null

client.once(Events.ClientReady, c => {
  channel = client.channels.cache.get('928367832016777247');
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

  //
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // Handle slash command requests

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


// loadJSON method to open the JSON file.
async function loadJSON(path) {
  try {
    const response = await axios.get(path)
    const jsonData = response.data
    const traits = jsonData.attributes
    let returnThis = 'White'
    for(let i = 0; i < traits.length; i++) {
      console.log('i: ',i)
      console.log('traits: ',traits)
      if(traits[i].trait_type === 'Background' && traits[i].value === 'Wanted') {
        returnThis = 'Wanted'
      }
    }
    return returnThis
  } catch (error) {
    console.log(error)
  }
}

// Format Embed
async function formatAndSendEmbed(event) {
    // Handle both individual items + bundle sales
    const assetName = _.get(event, ['nft', 'name']);
    const openseaLink = _.get(event, ['nft', 'opensea_url']);
    
    const buyerAddr = _.get(event, ['buyer']).slice(2, 8);
          

    const totalPrice = _.get(event, ['payment', 'quantity']);

    const tokenDecimals = _.get(event, ['payment', 'decimals']);

    const formattedUnits = ethers.utils.formatUnits(totalPrice, tokenDecimals);
    const units = _.get(event, ['payment', 'symbol']);

    const description = `The federally wanted individual known as ${assetName} was captured by ${buyerAddr} for a bounty of ${formattedUnits} ${units}`;

    console.log(description);

    const imageUrl = _.get(event, ['nft', 'image_url']);

    // inside a command, event listener, etc.
    const exampleEmbed = new EmbedBuilder()
      .setColor('#aa0000')
      .setAuthor({ name: 'Fugitive Tracking Report'})
      .setTitle(assetName.toUpperCase()+' CAPTURED!')
      .setDescription(description)
      .setURL(openseaLink)
      .addFields(
        { name: 'Bounty', value: formattedUnits+' '+units, inline: true },
        { name: 'Captor', value: buyerAddr, inline: true },
        //{ name: 'Threat Level', value: threatLevel, inline: true },
      )
      .setImage(imageUrl)
      .setFooter({ text: 'Last Stand Trading Co.'})
      .setTimestamp();
    channel.send({ embeds: [exampleEmbed] });
}

setInterval(() => {
  const lastSaleTime = cache.get('lastSaleTime', null) || DateTime.now().startOf('minute').minus(59000).toUnixInteger()
  console.log('Last sale (in seconds since Unix epoch): '+cache.get('lastSaleTime', null));
  
  axios.get('https://api.opensea.io/api/v2/events/collection/'+process.env.COLLECTION_SLUG, {
      headers: {
          'X-API-KEY': process.env.OPENSEA_API_KEY
      },
      params: {
          event_type: 'sale',
          after: lastSaleTime
      }
  }).then((response) => {

    const events = _.get(response, ['data', 'asset_events']);
    const sortedEvents = _.sortBy(events, function(event) {
        const created = _.get(event, 'event_timestamp');
        return new Date(created);
    })

    console.log(events.length, ' sales since the last one...');

    _.each(sortedEvents, (event) => {
        const created = _.get(event, 'event_timestamp');
        cache.set('lastSaleTime', DateTime.fromISO(created).toUnixInteger());
        return formatAndSendEmbed(event);
    });
  }).catch((error) => {
      console.error(error);
  });
}, 60000);
