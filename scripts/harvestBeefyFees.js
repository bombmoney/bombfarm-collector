const ethers = require('ethers');

const chains = require('../data/chains');
const { isNewPeriodNaive } = require('../utils/harvestHelpers');

const abi = ['function harvest() public'];

const harvestBeefyFees = async () => {
  for (chain of Object.values(chains)) {
    if (!chain.beefyFeeBatcher) {
      console.log(`${chain.id} does not have a fee batcher, skipping.`);
      continue;
    }
    if (!isNewPeriodNaive(chain.beefyFeeHarvestInterval)) {
      console.log(`Is not time to harvest ${chain.id}, skipping.`);
      continue;
    }

    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
      const harvester = new ethers.Wallet(process.env.HARVESTER_PK, provider);
      const batcher = new ethers.Contract(chain.beefyFeeBatcher, abi, harvester);

      let tx = await batcher.harvest({ gasLimit: 4000000 });
      console.log(`Harvested chain ${chain.chainId}`);
    } catch (e) {
      console.log(`harvestBeefyFees failed ${chain.chainId}: ${e}`);
    }
  }
};

module.exports = harvestBeefyFees;
