/**
 * XLayer 标的配置
 * 定义支持的交易对、代币地址、ccxt 映射
 */

export interface XLayerToken {
  symbol: string;        // XLayer 交易对名称，例如 'WOKB/USDT'
  name: string;          // 代币全名
  address: string;       // XLayer 合约地址
  quoteAddress: string;  // 报价代币地址 (USDT)
  ccxtSymbol: string | null;  // ccxt 对应 symbol（OKX CEX）
  ccxtExchange: string;  // ccxt 交易所 id
  available: boolean;    // 是否可用（有 CEX 数据源）
  dataSource: string;    // 数据来源说明
}

export const USDT_ADDRESS = '0x1e4a5963abfd975d8c9021ce480b42188849d41d';
export const USDT0_ADDRESS = '0x779ded0c9e1022225f8e0630b35a9b54be713736';
export const USDC_ADDRESS = '0x74b7f16337b8972027f6196a17a631ac6de26d22';

export const XLAYER_TOKENS: XLayerToken[] = [
  {
    symbol: 'WOKB/USDT',
    name: 'Wrapped OKB',
    address: '0xe538905cf8410324e03a5a23c1c177a474d59b2b',
    quoteAddress: USDT_ADDRESS,
    ccxtSymbol: 'OKB/USDT',
    ccxtExchange: 'okx',
    available: true,
    dataSource: 'OKX CEX (equivalent pair: OKB/USDT)',
  },
  {
    symbol: 'XETH/USDT',
    name: 'Wrapped ETH on XLayer',
    address: '0xe7b000003a45145decf8a28fc755ad5ec5ea025a',
    quoteAddress: USDT_ADDRESS,
    ccxtSymbol: 'ETH/USDT',
    ccxtExchange: 'okx',
    available: true,
    dataSource: 'OKX CEX (equivalent pair: ETH/USDT)',
  },
  {
    symbol: 'XBTC/USDT',
    name: 'Wrapped BTC on XLayer',
    address: '0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f',
    quoteAddress: USDT_ADDRESS,
    ccxtSymbol: 'BTC/USDT',
    ccxtExchange: 'okx',
    available: true,
    dataSource: 'OKX CEX (equivalent pair: BTC/USDT)',
  },
  {
    symbol: 'XSOL/USDT',
    name: 'Wrapped SOL on XLayer',
    address: '0x505000008de8748dbd4422ff4687a4fc9beba15b',
    quoteAddress: USDT_ADDRESS,
    ccxtSymbol: 'SOL/USDT',
    ccxtExchange: 'okx',
    available: true,
    dataSource: 'OKX CEX (equivalent pair: SOL/USDT)',
  },
  {
    symbol: 'TITAN/USDT',
    name: 'Titan (XLayer Ecosystem)',
    address: '0xfdc4a45a4bf53957b2c73b1ff323d8cbe39118dd',
    quoteAddress: USDT_ADDRESS,
    ccxtSymbol: null,
    ccxtExchange: 'okx',
    available: false,
    dataSource: 'No CEX equivalent available yet — on-chain data coming soon',
  },
];

/**
 * 将 XLayer 标的名映射为 ccxt 可用的 symbol
 * 例如：'WOKB/USDT' → 'OKB/USDT'
 */
export function mapToCcxtSymbol(xlayerSymbol: string): string | null {
  const token = XLAYER_TOKENS.find(t => t.symbol === xlayerSymbol);
  return token?.ccxtSymbol ?? null;
}

/**
 * 获取所有可用的标的列表
 */
export function getAvailableSymbols(): XLayerToken[] {
  return XLAYER_TOKENS.filter(t => t.available);
}

/**
 * 获取所有标的列表（包括不可用的）
 */
export function getAllSymbols(): XLayerToken[] {
  return XLAYER_TOKENS;
}

/**
 * 支持的时间框架
 */
export const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Timeframe = typeof SUPPORTED_TIMEFRAMES[number];
