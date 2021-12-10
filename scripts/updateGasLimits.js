require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const chains = require('../data/chains');
const strats = require('../data/strats.json');
const CHAIN_ID = parseInt(process.argv[2]);
const CHAIN = chains[CHAIN_ID];

const addGasLimitToStrats = async (strats, provider) => {
  const estimateGas = async (strat, average) => {
    try {
      let limit = await provider.estimateGas({
        to: strat.address,
        // `function harvest()`
        data: strat.harvestSignature,
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

  let responses = await Promise.allSettled(strats.map(strat => estimateGas(strat)));
  fullfilled = responses.filter(s => s.status === 'fulfilled').map(s => s.value);

  let average =
    fullfilled.length > 125 &&
    Number(
      fullfilled.reduce((total, g) => total + Number(g.gasLimit), 0) / fullfilled.length
    ).toFixed();
  console.log(`==> Average Gas: ${average}`);

  if (average) {
    let responsesWithAverage = await Promise.allSettled(
      strats.map(strat => estimateGas(strat, average))
    );
    fullfilled = responsesWithAverage.filter(s => s.status === 'fulfilled').map(s => s.value);
  }

  fs.writeFileSync(
    path.join(__dirname, '../data/gasLimits.json'),
    JSON.stringify(fullfilled, null, 2)
  );
  return fullfilled;
};

const main = async () => {
  console.log(
    `==> Starting Adding Gas Limits on ${CHAIN.id} \t- id ${CHAIN_ID} \t- rpc ${CHAIN.rpc}`
  );
  const provider = new ethers.providers.JsonRpcProvider(CHAIN.rpc);
  let filtered = strats.filter(s => s.chainId === CHAIN_ID);
  console.log(`==> total strats ${filtered.length}`);
  let added = await addGasLimitToStrats(filtered, provider);
  console.log(`==> after add gas limit: ${added.length} strat with gas limit`);
  console.table(added);
};

main();
