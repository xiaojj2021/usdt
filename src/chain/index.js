/**
 * 链交互统一入口
 * 根据 chain_type 自动路由到对应链模块
 */
const trc20 = require('./trc20');
const bsc = require('./bsc');

const getChainModule = (chainType) => {
  switch (chainType?.toLowerCase()) {
    case 'trc20': return trc20;
    case 'bsc': return bsc;
    default: throw new Error(`不支持的链类型: ${chainType}`);
  }
};

module.exports = {
  trc20,
  bsc,
  getChainModule,

  generateAddress: (chainType) => getChainModule(chainType).generateAddress(),
  getUSDTBalance: (chainType, address) => getChainModule(chainType).getUSDTBalance(address),
  getCurrentBlock: (chainType) => getChainModule(chainType).getCurrentBlock(),
  getTransactionConfirmations: (chainType, txid) => getChainModule(chainType).getTransactionConfirmations(txid),
};
