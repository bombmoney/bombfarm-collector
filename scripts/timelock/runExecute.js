const ethers = require('ethers');
const { addressBook } = require('blockchain-addressbook');

const chains = require('../../data/chains');
const { sleep } = require('../../utils/harvestHelpers');
const execute = require('./execute');
const chainIdFromName = require('../../utils/chainIdFromName');

const UPGRADE_STRAT = '0xe6685244';
const chainName = 'bsc';

const config = {
  timelockAddress: addressBook[chainName].platforms.beefyfinance.vaultOwner,
  chainId: chainIdFromName(chainName),
  pk: process.env.REWARDER_PK,
  value: 0,
  data: UPGRADE_STRAT,
  predecessor: ethers.constants.HashZero,
  salt: ethers.constants.HashZero,
  delay: 21600,
  addresses: [],
};

const main = async () => {
  for (address of config.addresses) {
    const provider = new ethers.providers.JsonRpcProvider(chains[config.chainId].rpc);
    const signer = new ethers.Wallet(config.pk, provider);

    await execute({
      timelockAddr: config.timelockAddress,
      target: address,
      value: config.value,
      data: config.data,
      predecessor: config.predecessor,
      salt: config.salt,
      signer,
    });

    await sleep(config.delay);
  }
};

main();
