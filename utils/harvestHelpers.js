const ethers = require('ethers');
const IStrategy = require('../abis/IStrategy.json');
const axios = require('axios');
const ERC20 = require('../abis/ERC20.json');

const between = (min, max) => Math.floor(Math.random() * (max - min) + min);

const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const isNewHarvestPeriodFromEvents = async (strat, harvester) => {
  const strategy = new ethers.Contract(strat.address, IStrategy, harvester);
  const filter = strategy.filters.StratHarvest(null);
  const logs = await strategy.queryFilter(filter);
  console.log('YO', logs);
  return false;
};

const isNewHarvestPeriod = async (strat, signature) => {
  let result = false;

  try {
    const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${strat.address}&startblock=0&endblock=99999999&sort=asc`;
    const response = await axios.get(url);
    let txs = response.data.result.reverse();

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];

      if (tx.input.substring(0, 10) === signature && tx.isError === '0') {
        const now = parseInt(new Date().getTime() / 1000);
        const harvestPeriod = strat.interval * 3600;
        result = tx.timeStamp < now - harvestPeriod ? true : false;

        console.log(`Last harvest was: ${((now - tx.timeStamp) / 3600).toFixed(2)} hours ago.`);

        break;
      }
    }

    return result;
  } catch (e) {
    return false;
  }
};

const hasStakers = async (strat, harvester) => {
  const strategy = new ethers.Contract(strat.address, IStrategy, harvester);
  const balance = await strategy.balanceOf();
  return balance.gt(0) ? true : false;
};

// Sometimes required due to the Fortube strat bug.
// It will crash if users haven't withdrawn anything.
const subsidyWant = async (strat, harvester) => {
  const { want, address, subsidy } = strat;
  const wantContract = new ethers.Contract(want, ERC20, harvester);
  const balance = await wantContract.balanceOf(address);
  if (balance.lt(subsidy)) {
    await wantContract.transfer(address, subsidy);
  }
};

module.exports = {
  isNewHarvestPeriod,
  isNewHarvestPeriodFromEvents,
  hasStakers,
  subsidyWant,
  sleep,
  between,
};
