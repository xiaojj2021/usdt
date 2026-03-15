/**
 * 链交互统一入口
 * 根据 chain_type 自动路由到对应链模块
 * BSC 模块延迟加载，避免 Web3 的 readable-stream 在启动时污染 TronWeb
 */
const trc20 = require('./trc20');

let _bsc = null;
const getBsc = () => {
  if (!_bsc) _bsc = require('./bsc');
  return _bsc;
};

const getChainModule = (chainType) => {
  switch (chainType?.toLowerCase()) {
    case 'trc20': return trc20;
    case 'bsc': return getBsc();
    default: throw new Error(`不支持的链类型: ${chainType}`);
  }
};

module.exports = {
  trc20,
  get bsc() { return getBsc(); },
  getChainModule,

  generateAddress: (chainType) => getChainModule(chainType).generateAddress(),
  getUSDTBalance: (chainType, address) => getChainModule(chainType).getUSDTBalance(address),
  getCurrentBlock: (chainType) => getChainModule(chainType).getCurrentBlock(),
  getTransactionConfirmations: (chainType, txid) => getChainModule(chainType).getTransactionConfirmations(txid),
};
