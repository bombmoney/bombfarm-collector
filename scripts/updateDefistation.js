const { BigNumber, utils, ethers } = require('ethers');
const axios = require('axios');

const fetchPrice = require('../utils/fetchPrice');

const vaults = require('../data/defistation.json');
const BeefyVault = require('../abis/BeefyVault.json');

const DEFISTATION_URL = 'https://api.defistation.io/dataProvider/tvl';

const fetchVaultTvl = async ({ vault, harvester }) => {
  try {
    const vaultContract = new ethers.Contract(vault.contract, BeefyVault, harvester);
    const vaultBalance = await vaultContract.balance();

    const price = await fetchPrice({ oracle: vault.oracle, id: vault.oracleId });
    const normalizationFactor = 1000000;
    const normalizedPrice = BigNumber.from(Math.round(price * normalizationFactor));
    const vaultBalanceInUsd = vaultBalance.mul(normalizedPrice.toString());
    const result = vaultBalanceInUsd.div(normalizationFactor);

    const vaultObjTvl = utils.formatEther(result);
    vault.tvl = Number(vaultObjTvl).toFixed(2);

    return vault.tvl;
  } catch (err) {
    console.log('error fetching price tvl:', vault.oracleId);
    return 0;
  }
};

const updateDefistation = async () => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC);
  const harvester = new ethers.Wallet(process.env.REWARDER_PK, provider);

  let promises = [];
  vaults.forEach(vault => promises.push(fetchVaultTvl({ vault, harvester })));
  const values = await Promise.all(promises);
  const totalTvl = values.reduce((acc, curr) => Number(acc) + Number(curr));

  const data = {
    tvl: totalTvl,
    bnb: 0,
    test: false,
    data: vaults,
  };

  const auth = Buffer.from(`${process.env.DEFISTATION_ID}:${process.env.DEFISTATION_KEY}`).toString(
    'base64'
  );

  axios
    .post(DEFISTATION_URL, data, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    })
    .then(res => {
      console.log(res.data);
    })
    .catch(error => {
      console.error(error);
    });

  // DEBUG tvl
  // console.log(data);
};

module.exports = updateDefistation;
