const ethers = require('ethers');

const IStrategy = require('../abis/IStrategy.json');
const {
  isNewHarvestPeriod,
  isNewHarvestPeriodBscscan,
  hasStakers,
  sleep,
} = require('../utils/harvestHelpers');
const chains = require('../data/chains');
const strats = require('../data/strats.json');

const harvest = async () => {
  for (const strat of strats) {
    try {
      console.log(`Analizing harvest of ${strat.name}.`);
      if (strat.chainId != 56) continue;

      const provider = new ethers.providers.JsonRpcProvider(chains[strat.chainId].rpc);
      const harvester = new ethers.Wallet(process.env.HARVESTER_PK, provider);

      let shouldHarvest = true;

      if (shouldHarvest) shouldHarvest = !strat.harvestPaused;
      if (shouldHarvest) shouldHarvest = await hasStakers(strat, harvester);
      if (shouldHarvest) {
        if (strat.noHarvestEvent) {
          shouldHarvest = await isNewHarvestPeriodBscscan(strat);
        } else {
          shouldHarvest = await isNewHarvestPeriod(strat, harvester);
        }
      }

      if (shouldHarvest) {
        const stratContract = new ethers.Contract(strat.address, IStrategy, harvester);
        let tx;

        if (strat.depositsPaused) {
          await stratContract.unpause({ gasLimit: 3500000 });
          tx = await stratContract.harvest({ gasLimit: 4000000 });
          tx = await tx.wait();
          tx.status === 1
            ? console.log(`${strat.name} harvested with tx: ${tx.transactionHash}`)
            : console.log(`${strat.name} harvest failed with tx: ${tx.transactionHash}`);
          await stratContract.pause({ gasLimit: 3500000 });
        } else {
          tx = await stratContract.harvest({ gasLimit: 4000000 });
          tx = await tx.wait();
          tx.status === 1
            ? console.log(`${strat.name} harvested with tx: ${tx.transactionHash}`)
            : console.log(`${strat.name} harvest failed with tx: ${tx.transactionHash}`);
        }
      } else {
        console.log(`Shouldn't harvest ${strat.name}`);
      }
      console.log('---');
    } catch (e) {
      console.log(`Couldn't harvest strat ${strat.name}: ${e}`);
    }

    await sleep(2000);
  }
};

module.exports = harvest;
