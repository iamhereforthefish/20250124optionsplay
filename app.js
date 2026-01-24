/**
 * Options Pricing Interface - Main Application
 */

// Application state
let currentOptionType = 'call';

/**
 * Set the option type (call or put)
 */
function setOptionType(type) {
    currentOptionType = type;

    // Update UI
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === type) {
            btn.classList.add('active');
        }
    });
}

/**
 * Fetch market data from API
 * Uses Yahoo Finance via a CORS proxy or alternative APIs
 */
async function fetchMarketData() {
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();
    const statusEl = document.getElementById('fetch-status');
    const fetchBtn = document.getElementById('fetch-btn');

    if (!ticker) {
        statusEl.textContent = 'Please enter a ticker symbol';
        statusEl.className = 'status-message error';
        return;
    }

    // Update UI to loading state
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Loading...';
    statusEl.textContent = 'Fetching market data...';
    statusEl.className = 'status-message loading';

    try {
        // Try multiple data sources
        let data = null;

        // Option 1: Try Yahoo Finance via public API
        try {
            data = await fetchYahooFinance(ticker);
        } catch (e) {
            console.log('Yahoo Finance failed, trying alternative...');
        }

        // Option 2: Try Finnhub (free tier)
        if (!data) {
            try {
                data = await fetchFinnhub(ticker);
            } catch (e) {
                console.log('Finnhub failed, trying alternative...');
            }
        }

        // Option 3: Try Alpha Vantage
        if (!data) {
            try {
                data = await fetchAlphaVantage(ticker);
            } catch (e) {
                console.log('Alpha Vantage failed');
            }
        }

        if (data) {
            // Populate fields
            document.getElementById('stock-price').value = data.price.toFixed(2);

            if (data.volatility) {
                document.getElementById('volatility').value = (data.volatility * 100).toFixed(1);
            }

            // Set a default strike price (at-the-money)
            const strike = Math.round(data.price);
            document.getElementById('strike-price').value = strike.toFixed(2);

            // Set default expiry if not set
            if (!document.getElementById('time-to-expiry').value) {
                document.getElementById('time-to-expiry').value = 30;
            }

            statusEl.textContent = `Loaded: ${ticker} @ $${data.price.toFixed(2)}`;
            statusEl.className = 'status-message success';
        } else {
            throw new Error('Unable to fetch data from any source');
        }

    } catch (error) {
        console.error('Error fetching data:', error);
        statusEl.textContent = `Error: ${error.message}. Try entering data manually.`;
        statusEl.className = 'status-message error';
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Data';
    }
}

/**
 * Fetch data from Yahoo Finance
 */
async function fetchYahooFinance(ticker) {
    // Using a public Yahoo Finance endpoint
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Yahoo Finance request failed');

    const data = await response.json();

    if (data.chart.error) {
        throw new Error(data.chart.error.description);
    }

    const result = data.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0];

    // Calculate historical volatility from the last month's data
    const closes = quotes.close.filter(c => c !== null);
    const volatility = calculateHistoricalVolatility(closes);

    return {
        price: meta.regularMarketPrice,
        volatility: volatility,
        previousClose: meta.previousClose
    };
}

/**
 * Fetch data from Finnhub (requires API key)
 */
async function fetchFinnhub(ticker) {
    // Note: You'll need to add your own API key for production use
    const apiKey = 'demo'; // Replace with your Finnhub API key
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Finnhub request failed');

    const data = await response.json();

    if (!data.c || data.c === 0) {
        throw new Error('No data available');
    }

    return {
        price: data.c, // Current price
        previousClose: data.pc,
        volatility: null // Finnhub doesn't provide volatility in quote
    };
}

/**
 * Fetch data from Alpha Vantage (requires API key)
 */
async function fetchAlphaVantage(ticker) {
    // Note: You'll need to add your own API key for production use
    const apiKey = 'demo'; // Replace with your Alpha Vantage API key
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Alpha Vantage request failed');

    const data = await response.json();
    const quote = data['Global Quote'];

    if (!quote || !quote['05. price']) {
        throw new Error('No data available');
    }

    return {
        price: parseFloat(quote['05. price']),
        previousClose: parseFloat(quote['08. previous close']),
        volatility: null
    };
}

/**
 * Calculate historical volatility from price data
 * @param {number[]} prices - Array of closing prices
 * @returns {number} Annualized volatility
 */
function calculateHistoricalVolatility(prices) {
    if (prices.length < 2) return 0.25; // Default to 25% if not enough data

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i] && prices[i - 1]) {
            returns.push(Math.log(prices[i] / prices[i - 1]));
        }
    }

    if (returns.length < 2) return 0.25;

    // Calculate standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);

    // Annualize (252 trading days)
    return dailyVol * Math.sqrt(252);
}

/**
 * Calculate option price and Greeks
 */
function calculateOption() {
    // Get input values
    const S = parseFloat(document.getElementById('stock-price').value);
    const K = parseFloat(document.getElementById('strike-price').value);
    const days = parseFloat(document.getElementById('time-to-expiry').value);
    const sigma = parseFloat(document.getElementById('volatility').value) / 100;
    const r = parseFloat(document.getElementById('risk-free-rate').value) / 100;
    const q = parseFloat(document.getElementById('dividend-yield').value) / 100;

    // Validate inputs
    if (isNaN(S) || S <= 0) {
        alert('Please enter a valid stock price');
        return;
    }
    if (isNaN(K) || K <= 0) {
        alert('Please enter a valid strike price');
        return;
    }
    if (isNaN(days) || days <= 0) {
        alert('Please enter valid days to expiry');
        return;
    }
    if (isNaN(sigma) || sigma <= 0) {
        alert('Please enter a valid volatility');
        return;
    }

    // Convert days to years
    const T = days / 365;

    // Calculate using Black-Scholes
    const results = BlackScholes.calculateAll(currentOptionType, S, K, T, r, sigma, q);
    const intrinsic = BlackScholes.intrinsicValue(currentOptionType, S, K);
    const timeValue = results.price - intrinsic;
    const probITM = BlackScholes.probITM(currentOptionType, S, K, T, r, sigma, q);
    const breakeven = BlackScholes.breakeven(currentOptionType, K, results.price);

    // Update UI
    updateDisplay('option-premium', formatCurrency(results.price));
    updateDisplay('intrinsic-value', formatCurrency(intrinsic));
    updateDisplay('time-value', formatCurrency(timeValue));

    // Update Greeks
    updateDisplay('delta', formatNumber(results.delta, 4), results.delta >= 0 ? 'positive' : 'negative');
    updateDisplay('gamma', formatNumber(results.gamma, 4));
    updateDisplay('theta', formatNumber(results.theta, 4), results.theta >= 0 ? 'positive' : 'negative');
    updateDisplay('vega', formatNumber(results.vega, 4));
    updateDisplay('rho', formatNumber(results.rho, 4), results.rho >= 0 ? 'positive' : 'negative');

    // Update probability analysis
    updateDisplay('prob-itm', formatPercent(probITM));
    updateDisplay('prob-otm', formatPercent(1 - probITM));
    updateDisplay('breakeven', formatCurrency(breakeven));
}

/**
 * Update display element
 */
function updateDisplay(id, value, colorClass = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
        el.classList.remove('positive', 'negative');
        if (colorClass) {
            el.classList.add(colorClass);
        }
    }
}

/**
 * Format number to currency
 */
function formatCurrency(value) {
    if (isNaN(value) || !isFinite(value)) return '--';
    return '$' + value.toFixed(2);
}

/**
 * Format number with specified decimals
 */
function formatNumber(value, decimals = 2) {
    if (isNaN(value) || !isFinite(value)) return '--';
    return value.toFixed(decimals);
}

/**
 * Format number as percentage
 */
function formatPercent(value) {
    if (isNaN(value) || !isFinite(value)) return '--';
    return (value * 100).toFixed(1) + '%';
}

/**
 * Initialize the application
 */
function init() {
    // Add enter key support for ticker input
    document.getElementById('ticker').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchMarketData();
        }
    });

    // Add enter key support for all inputs to trigger calculation
    document.querySelectorAll('.input-grid input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                calculateOption();
            }
        });
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
