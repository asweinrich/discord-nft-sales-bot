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
import cache from './cache.js';
import _ from 'lodash';
import { ethers } from 'ethers';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let channel = null

client.once(Events.ClientReady, c => {
  channel = client.channels.cache.get('942115367935967264');
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
    const assetName = _.get(event, ['asset', 'name'], _.get(event, ['asset_bundle', 'name']));
    const openseaLink = _.get(event, ['asset', 'permalink'], _.get(event, ['asset_bundle', 'permalink']));
    const metadataUrl = _.get(event, ['asset', 'token_metadata'], _.get(event, ['asset_bundle', 'token_metadata']));
  
    const background = await loadJSON(metadataUrl);
    
    let threatLevel = 'Moderate'

    if (background === 'Wanted') {
      threatLevel = 'Most Wanted'
    }
    
    let finalBuyer = '';
    
    const buyerAddr = _.get(event, ['winner_account', 'address']).slice(0, 6);
    if(_.get(event, ['winner_account', 'user', 'username']) != null) {
        let buyerName = _.get(event, ['winner_account', 'user', 'username']);
        if(buyerName.length > 15) {
            buyerName = buyerName.slice(0, 15) + '...';
        }
        finalBuyer = buyerName;
    } else {
        finalBuyer = buyerAddr;
    }      

    const totalPrice = _.get(event, 'total_price');

    const tokenDecimals = _.get(event, ['payment_token', 'decimals']);
    const tokenUsdPrice = _.get(event, ['payment_token', 'usd_price']);
    const tokenEthPrice = _.get(event, ['payment_token', 'eth_price']);

    const formattedUnits = ethers.utils.formatUnits(totalPrice, tokenDecimals);
    const formattedEthPrice = formattedUnits * tokenEthPrice;
    const formattedUsdPrice = formattedUnits * tokenUsdPrice;

    const description = `The federally wanted individual known as ${assetName} was captured by ${finalBuyer} for a bounty of ${formattedEthPrice} ETH`;

    console.log(description);

    const imageUrl = _.get(event, ['asset', 'image_url']);

    // inside a command, event listener, etc.
    const exampleEmbed = new EmbedBuilder()
      .setColor('#aa0000')
      .setAuthor({ name: 'Fugitive Tracking Report'})
      .setTitle(assetName.toUpperCase()+' CAPTURED!')
      .setDescription(description)
      .setURL(openseaLink)
      .addFields(
        { name: 'Bounty', value: formattedEthPrice+ethers.constants.EtherSymbol, inline: true },
        { name: 'USD', value: '$'+Number(formattedUsdPrice).toFixed(2), inline: true },
        { name: 'Captor', value: finalBuyer, inline: true },
        //{ name: 'Threat Level', value: threatLevel, inline: true },
      )
      .setImage(imageUrl)
      .setFooter({ text: 'Last Stand Trading Co.' , iconURL: 'https://wbstudio.asweinrich.dev/Untiled-2.png'})
      .setTimestamp();
    channel.send({ embeds: [exampleEmbed] });
}

setInterval(() => {
  const lastSaleTime = cache.get('lastSaleTime', null) || DateTime.now().startOf('minute').minus(59000).toUnixInteger()
  console.log('Last sale (in seconds since Unix epoch): '+cache.get('lastSaleTime', null));
  
  axios.get('https://api.opensea.io/api/v1/events', {
      headers: {
          'X-API-KEY': process.env.OPENSEA_API_KEY
      },
      params: {
          collection_slug: process.env.COLLECTION_SLUG,
          event_type: 'successful',
          occurred_after: 1678650409,
          only_opensea: 'false'
      }
  }).then((response) => {

    const events = _.get(response, ['data', 'asset_events']);
    const sortedEvents = _.sortBy(events, function(event) {
        const created = _.get(event, 'created_date');
        return new Date(created);
    })

    console.log(events.length, ' sales since the last one...');

    _.each(sortedEvents, (event) => {
        const created = _.get(event, 'created_date');
        cache.set('lastSaleTime', DateTime.fromISO(created).toUnixInteger());
        return formatAndSendEmbed(event);
    });
  }).catch((error) => {
      console.error(error);
  });
}, 60000);
