const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

let strats = require('../data/strats.json');

const config = {
  chains: [137],
  min: 1,
  max: 6,
  interval: 1,
};

const main = async () => {
  strats = strats.map(strat => {
    if (config.chains.includes(strat.chainId)) {
      if (strat.interval >= config.min && strat.interval <= config.max) {
        return {
          ...strat,
          interval: strat.interval + config.interval,
        };
      } else {
        return strat;
      }
    } else {
      return strat;
    }
  });

  fs.writeFileSync(path.join(__dirname, '../data/strats.json'), JSON.stringify(strats, null, 2));
};

main();
