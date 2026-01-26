'use client';

interface ExchangeRate {
  exchange: string;
  btcGbp: number;
  btcEur: number;
  btcUsd: number;
}

export interface CryptoRates {
  btcGbp: number;
  btcEur: number;
  btcUsd: number;
  lastUpdated: Date;
  sources: string[];
}

// Fetch BTC price from Kraken
async function fetchKrakenRates(): Promise<ExchangeRate | null> {
  try {
    const response = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=XBTGBP,XBTEUR,XBTUSD'
    );
    const data = await response.json();
    if (data.error?.length > 0) return null;

    return {
      exchange: 'Kraken',
      btcGbp: parseFloat(data.result.XXBTZGBP?.c?.[0] || '0'),
      btcEur: parseFloat(data.result.XXBTZEUR?.c?.[0] || '0'),
      btcUsd: parseFloat(data.result.XXBTZUSD?.c?.[0] || '0'),
    };
  } catch {
    console.warn('Failed to fetch Kraken rates');
    return null;
  }
}

// Fetch BTC price from Coinbase
async function fetchCoinbaseRates(): Promise<ExchangeRate | null> {
  try {
    const [gbpRes, eurRes, usdRes] = await Promise.all([
      fetch('https://api.coinbase.com/v2/prices/BTC-GBP/spot'),
      fetch('https://api.coinbase.com/v2/prices/BTC-EUR/spot'),
      fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
    ]);

    const [gbpData, eurData, usdData] = await Promise.all([
      gbpRes.json(),
      eurRes.json(),
      usdRes.json(),
    ]);

    return {
      exchange: 'Coinbase',
      btcGbp: parseFloat(gbpData.data?.amount || '0'),
      btcEur: parseFloat(eurData.data?.amount || '0'),
      btcUsd: parseFloat(usdData.data?.amount || '0'),
    };
  } catch {
    console.warn('Failed to fetch Coinbase rates');
    return null;
  }
}

// Fetch BTC price from Bitstamp
async function fetchBitstampRates(): Promise<ExchangeRate | null> {
  try {
    const [gbpRes, eurRes, usdRes] = await Promise.all([
      fetch('https://www.bitstamp.net/api/v2/ticker/btcgbp/'),
      fetch('https://www.bitstamp.net/api/v2/ticker/btceur/'),
      fetch('https://www.bitstamp.net/api/v2/ticker/btcusd/'),
    ]);

    const [gbpData, eurData, usdData] = await Promise.all([
      gbpRes.json(),
      eurRes.json(),
      usdRes.json(),
    ]);

    return {
      exchange: 'Bitstamp',
      btcGbp: parseFloat(gbpData.last || '0'),
      btcEur: parseFloat(eurData.last || '0'),
      btcUsd: parseFloat(usdData.last || '0'),
    };
  } catch {
    console.warn('Failed to fetch Bitstamp rates');
    return null;
  }
}

// Get average rates from all exchanges
export async function getCryptoRates(): Promise<CryptoRates> {
  const results = await Promise.all([
    fetchKrakenRates(),
    fetchCoinbaseRates(),
    fetchBitstampRates(),
  ]);

  const validResults = results.filter((r): r is ExchangeRate => r !== null && r.btcGbp > 0);

  if (validResults.length === 0) {
    // Fallback rates if all APIs fail (approximate as of Jan 2026)
    return {
      btcGbp: 70000,
      btcEur: 83000,
      btcUsd: 87000,
      lastUpdated: new Date(),
      sources: ['Fallback'],
    };
  }

  const avgGbp = validResults.reduce((sum, r) => sum + r.btcGbp, 0) / validResults.length;
  const avgEur = validResults.reduce((sum, r) => sum + r.btcEur, 0) / validResults.length;
  const avgUsd = validResults.reduce((sum, r) => sum + r.btcUsd, 0) / validResults.length;

  return {
    btcGbp: avgGbp,
    btcEur: avgEur,
    btcUsd: avgUsd,
    lastUpdated: new Date(),
    sources: validResults.map((r) => r.exchange),
  };
}

// Convert Sats to fiat
export function satsToFiat(
  sats: number,
  rates: CryptoRates
): { gbp: number; eur: number; usd: number } {
  const btc = sats / 100_000_000; // 1 BTC = 100,000,000 sats
  return {
    gbp: btc * rates.btcGbp,
    eur: btc * rates.btcEur,
    usd: btc * rates.btcUsd,
  };
}

// Format sats with proper commas
export function formatSats(sats: number): string {
  return sats.toLocaleString('en-US');
}

// Format fiat with currency symbol
export function formatFiat(amount: number, currency: 'gbp' | 'eur' | 'usd'): string {
  const symbols = { gbp: '£', eur: '€', usd: '$' };
  return `${symbols[currency]}${amount.toFixed(2)}`;
}
