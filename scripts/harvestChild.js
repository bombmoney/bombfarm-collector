require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const MultiCall = require('ethers-multicall');
const _ = require('lodash');
const CHAIN_ID = parseInt(process.argv[2]);

const IStrategy = require('../abis/IStrategy.json');
const harvestHelpers = require('../utils/harvestHelpers');
const chains = require('../data/chains');
const strats = require('../data/strats.json');
const { default: Axios } = require('axios');
const groups = _.groupBy(strats, 'chainId');

const CHAIN = chains[CHAIN_ID];

const LOGGER_PREFIX = `== ${CHAIN.id} `;

const logger = msg => {
  console.log(LOGGER_PREFIX + msg);
};

const getGasPrice = async provider => {
  let gas = null;
  if (CHAIN.gas.price) gas = chains[CHAIN_ID].gas.price;
  let gasPrice = await provider.getGasPrice();
  if (gasPrice) {
    gas = Number(gasPrice.toString()).toFixed();
    return gas;
  }
  try {
    if (chains[CHAIN_ID].gas.info) {
      if (chains[CHAIN_ID].gas.info.type === 'rest') {
        let res = await Axios.get(
          `${chains[CHAIN_ID].gas.info.url}?module=proxy&action=eth_gasPrice&apikey=${chains[CHAIN_ID].gas.info.apikey}`
        );
        if (res.data && res.data.status !== '0' && res.data.result)
          gas.gasPrice = parseInt(BigInt(res.data.result).toString());
        return gas;
      }
      if (chains[CHAIN_ID].gas.info.type === 'rpc') {
        let data = { jsonrpc: '2.0', method: 'eth_gasPrice', id: 1 };
        if (chains[CHAIN_ID].gas.info.method) data.method = chains[CHAIN_ID].gas.info.method;
        let res = await Axios.post(`${chains[CHAIN_ID].gas.info.url}`, data);
        if (res.data && res.data.status !== '0' && res.data.result)
          gas.gasPrice = parseInt(BigInt(res.data.result).toString());
        return gas;
      }
    }
    logger(`=> Gas Info API not recognized`);
    return gas;
  } catch (error) {
    logger('=> Can not get Gas price from Block Explorer');
    return gas;
  }
};

const addGasLimitToStrats = async (strats, provider) => {
  let gasLimits = require('../data/gasLimits.json');
  let filtered = gasLimits.filter(s => s.chainId === CHAIN_ID);
  let average =
    filtered.length > 125 &&
    Number(
      filtered.reduce((total, g) => total + Number(g.gasLimit), 0) / filtered.length
    ).toFixed();
  logger(`==> Average Gas: ${average}`);
  const estimateGas = async strat => {
    try {
      let limit = await provider.estimateGas({
        to: strat.address,
        // `function harvest()`
        data: '0x4641257d',
      });
      strat.gasLimit = Number((Number(limit) * 130) / 100).toFixed(); // Add a 30% of estimated gas
      return strat;
    } catch (error) {
      if (average) {
        strat.gasLimit = average;
        return strat;
      }
      throw error;
    }
  };

  //check when gaslimit already exists
  let gasLimitWanted = strats.filter(strat => filtered.every(s => s.address !== strat.address));

  let responses = await Promise.allSettled(gasLimitWanted.map(strat => estimateGas(strat)));
  responses = responses.filter(s => s.status === 'fulfilled').map(s => s.value);
  gasLimits.push(...responses);
  fs.writeFileSync(
    path.join(__dirname, '../data/gasLimits.json'),
    JSON.stringify(gasLimits, null, 2)
  );

  // get strats with gaslimit
  strats = gasLimits
    .filter(s => s.chainId === CHAIN_ID)
    .filter(g => strats.some(s => g.address === s.address));
  return strats;
};

const shouldHarvest = async (strat, harvesterPK) => {
  try {
    // logger(`=> Analizing harvest of ${strat.name}.`);
    if (strat.depositsPaused) throw new Error(`deposits paused`);
    if (strat.harvestPaused) throw new Error(`harvest paused`);
    const stratContract = new ethers.Contract(strat.address, IStrategy, harvesterPK);
    let hasStakers = await harvestHelpers.hasStakers(stratContract);
    if (!hasStakers) throw new Error(`has not stakers`);
    let lastHarvest = 0;
    try {
      lastHarvest = await stratContract.lastHarvest();
    } catch (err) {}
    if (lastHarvest !== 0) {
      let now = Math.floor(new Date().getTime() / 1000);
      let secondsSinceHarvest = now - lastHarvest;
      if (!(secondsSinceHarvest >= strat.interval * 3600))
        throw new Error(`lower than the interval`);
    } else if (strat.noHarvestEvent) {
      let noHarvestEvent = await harvestHelpers.isNewPeriodNaive(strat.interval);
      if (!noHarvestEvent) throw new Error(`is not new period naive`);
    } else {
      let isNewHarvestPeriod = await harvestHelpers.isNewHarvestPeriod(strat, harvesterPK);
      if (!isNewHarvestPeriod) throw new Error(`is not new harvest period`);
    }

    // Check if it profitiable
    // gas estimate
    return strat;
  } catch (error) {
    throw error;
  }
};

const harvest = async (strat, harvesterPK, options, nonce = null) => {
  const tryTX = async (stratContract, max = 5) => {
    let success = false;
    let tries = 0;
    if (nonce) options.nonce = nonce;
    while (!success && tries <= max) {
      tries++;
      let tx = await stratContract.harvest(options);
      try {
        tx = await tx.wait();
        if (tx.status === 1) {
          logger(
            `=> ${strat.name}:\tharvested after tried ${tries} with tx: ${tx.transactionHash}`
          );
          return tx;
        }
        logger(
          `=> Error - after tried ${tries} - ${strat.name}: harvest failed with tx has: ${tx.transactionHash}`
        );
      } catch (error) {
        if (tries === max) throw new Error(error);
      }
    }
  };

  try {
    const stratContract = new ethers.Contract(strat.address, IStrategy, harvesterPK);
    let tx = await tryTX(stratContract);
    return tx;
  } catch (e) {
    logger(`=> Error - Couldn't harvest strat ${strat.name} after 5 tries: ${e}`);
    // throw new Error(`=> Error - Couldn't harvest strat ${strat.name} after 5 tries: ${e}`);
  }
};

const main = async () => {
  if (CHAIN && CHAIN.id) {
    // let nonce = await harvesterPK.getTransactionCount();
    let strats = [];
    let tries = 0;
    logger(`==> Starting Harvester on ${CHAIN.id} \t- id ${CHAIN_ID} \t- rpc ${CHAIN.rpc}`);
    do {
      tries++;
      try {
        logger(`==> Try n ${tries}`);
        const provider = new ethers.providers.JsonRpcProvider(CHAIN.rpc);
        let gasPrice = await getGasPrice(provider);
        logger(`==> Gas Price: ${gasPrice}`);
        const harvesterPK = new ethers.Wallet(process.env.HARVESTER_PK, provider);
        let balance = await harvesterPK.getBalance();
        strats = await Promise.allSettled(
          groups[CHAIN_ID].map(strat => shouldHarvest(strat, harvesterPK))
        );
        strats = strats.filter(r => r.status === 'fulfilled').map(s => s.value);
        strats = await addGasLimitToStrats(strats, provider);
        console.table(strats);
        let totalGas = strats.reduce((total, s) => total + Number(s.gasLimit), 0) / 1e9;
        logger(
          `==> Total gas to use ${(totalGas * gasPrice) / 1e9}, current balance ${balance / 1e18}`
        );

        /**
         * create a while there is strat to harevest
         * - after map all strats, check that failed and try it again map
         * - repeat until there is no more strats to do it
         * - set a maximium of 10 tries
         */

        const harvested = await Promise.allSettled(
          strats.map(strat => {
            let options = {
              gasLimit: strat.gasLimit,
              gasPrice,
            };
            return harvest(strat, harvesterPK, options);
          })
        );
        strats = harvested.filter(s => s.status !== 'rejected').map(s => s.value);
      } catch (error) {}
    } while (strats.length > 0 && tries <= 10);
    logger(`===> done`);
  }
  process.exit();
};

main();
