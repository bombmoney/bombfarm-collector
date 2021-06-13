const ethers = require('ethers');

const chains = require('../../data/chains');
const strats = require('../../data/strats.json');
const TimelockAbi = require('../../abis/TimelockController.json');
const { sleep } = require('../../utils/harvestHelpers');
const schedule = require('./schedule');
const stratAbi = ['function beefyFeeRecipient() public view returns (address)'];

const config = {
  timelockAddress: '0x6d28afD25a1FBC5409B1BeFFf6AEfEEe2902D89F',
  chainId: 137,
  value: 0,
  data: '0xa68833e5000000000000000000000000b66ca5319efc42fd1462693bab51ee0c9e452745',
  predecessor: ethers.constants.HashZero,
  salt: ethers.constants.HashZero,
};

const main = async () => {
  for (strat of strats) {
    if (strat.chainId !== config.chainId) continue;

    await sleep(10000);

    const provider = new ethers.providers.JsonRpcProvider(chains[config.chainId].rpc);
    const signer = new ethers.Wallet(process.env.UPGRADER_PK, provider);
    const stratContract = new ethers.Contract(strat.address, stratAbi, signer);

    let beefyFeeRecipient, tx;
    try {
      beefyFeeRecipient = await stratContract.beefyFeeRecipient();
    } catch (e) {
      console.log(
        `Strat ${strat.name} does not implement 'beefyFeeRecipient'. Will leave unchanged.`
      );
      continue;
    }

    if (beefyFeeRecipient === config.beefyFeeRecipient) {
      console.log(`Strat ${strat.name} already has the correct beefy fee recipient.`);
      continue;
    }

    await schedule({
      timelockAddr: config.timelockAddress,
      target: strat.address,
      value: config.value,
      data: config.data,
      predecessor: config.predecessor,
      salt: config.salt,
      signer,
    });
  }
};

main();
