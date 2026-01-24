/**
 * Options Pricing Interface - Main Application
 * Using MarketData.app API for real-time options data
 */

// MarketData.app API configuration
const MARKETDATA_API = {
    baseUrl: 'https://api.marketdata.app/v1',
    token: 'X0htSHRqcThNTGJuOUVOb1YxQVRMcGN3cl9XdTd2Y3lrV2ZWN2wzc2FQMD0'
};

// Application state
let currentOptionType = 'call';
let optionsChainData = null;

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
 * Fetch market data from MarketData.app API
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
        // Fetch stock quote
        const stockData = await fetchStockQuote(ticker);

        // Populate stock price
        document.getElementById('stock-price').value = stockData.price.toFixed(2);

        // Set a default strike price (at-the-money, rounded to nearest 5)
        const strike = Math.round(stockData.price / 5) * 5;
        document.getElementById('strike-price').value = strike.toFixed(2);

        // Set default expiry if not set
        if (!document.getElementById('time-to-expiry').value) {
            document.getElementById('time-to-expiry').value = 30;
        }

        // Fetch options chain to get IV
        try {
            const optionsData = await fetchOptionsChain(ticker);
            if (optionsData && optionsData.iv) {
                document.getElementById('volatility').value = (optionsData.iv * 100).toFixed(1);
            }
            optionsChainData = optionsData;
        } catch (e) {
            console.log('Options chain fetch failed, using default IV');
            document.getElementById('volatility').value = '25';
        }

        statusEl.textContent = `Loaded: ${ticker} @ $${stockData.price.toFixed(2)}`;
        statusEl.className = 'status-message success';

    } catch (error) {
        console.error('Error fetching data:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-message error';
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Data';
    }
}

/**
 * Fetch stock quote from MarketData.app
 */
async function fetchStockQuote(ticker) {
    const url = `${MARKETDATA_API.baseUrl}/stocks/quotes/${ticker}/`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.errmsg || `API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.last || data.last.length === 0) {
        throw new Error('No data available for this symbol');
    }

    return {
        price: data.last[0],
        bid: data.bid ? data.bid[0] : null,
        ask: data.ask ? data.ask[0] : null,
        volume: data.volume ? data.volume[0] : null,
        change: data.change ? data.change[0] : null
    };
}

/**
 * Fetch options chain from MarketData.app
 */
async function fetchOptionsChain(ticker) {
    // Get expiration dates first
    const expUrl = `${MARKETDATA_API.baseUrl}/options/expirations/${ticker}/`;

    const expResponse = await fetch(expUrl, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!expResponse.ok) {
        throw new Error('Failed to fetch options expirations');
    }

    const expData = await expResponse.json();

    if (expData.s !== 'ok' || !expData.expirations || expData.expirations.length === 0) {
        throw new Error('No options available for this symbol');
    }

    // Use the nearest expiration date
    const nearestExpiry = expData.expirations[0];

    // Fetch options chain for that expiration
    const chainUrl = `${MARKETDATA_API.baseUrl}/options/chain/${ticker}/?expiration=${nearestExpiry}`;

    const chainResponse = await fetch(chainUrl, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!chainResponse.ok) {
        throw new Error('Failed to fetch options chain');
    }

    const chainData = await chainResponse.json();

    if (chainData.s !== 'ok') {
        throw new Error('Invalid options chain data');
    }

    // Calculate average IV from the chain
    let totalIV = 0;
    let ivCount = 0;

    if (chainData.iv && chainData.iv.length > 0) {
        chainData.iv.forEach(iv => {
            if (iv && iv > 0 && iv < 5) { // Filter reasonable IV values
                totalIV += iv;
                ivCount++;
            }
        });
    }

    const avgIV = ivCount > 0 ? totalIV / ivCount : 0.25;

    return {
        expiration: nearestExpiry,
        iv: avgIV,
        chain: chainData
    };
}

/**
 * Fetch specific option quote
 */
async function fetchOptionQuote(optionSymbol) {
    const url = `${MARKETDATA_API.baseUrl}/options/quotes/${optionSymbol}/`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch option quote');
    }

    const data = await response.json();

    if (data.s !== 'ok') {
        throw new Error('Invalid option data');
    }

    return {
        bid: data.bid ? data.bid[0] : null,
        ask: data.ask ? data.ask[0] : null,
        last: data.last ? data.last[0] : null,
        iv: data.iv ? data.iv[0] : null,
        delta: data.delta ? data.delta[0] : null,
        gamma: data.gamma ? data.gamma[0] : null,
        theta: data.theta ? data.theta[0] : null,
        vega: data.vega ? data.vega[0] : null,
        openInterest: data.openInterest ? data.openInterest[0] : null,
        volume: data.volume ? data.volume[0] : null
    };
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

    // Update P/L chart
    if (typeof updateChart === 'function') {
        updateChart();
    }

    // Update Seller's Yield Analysis
    calculateYieldAnalysis(S, K, days, results.price, currentOptionType);
}

/**
 * Calculate and display seller's yield analysis
 * @param {number} S - Stock price
 * @param {number} K - Strike price
 * @param {number} days - Days to expiry
 * @param {number} premium - Option premium
 * @param {string} type - 'call' or 'put'
 */
function calculateYieldAnalysis(S, K, days, premium, type) {
    // Period yield: Premium / Stock Price
    const periodYield = premium / S;

    // Annualized yield: Period yield * (365 / days)
    const annualizedYield = periodYield * (365 / days);

    // Premium per day (theta-based income)
    const premiumPerDay = premium / days;

    // Monthly equivalent yield (if repeated 12x per year)
    const monthlyYield = annualizedYield / 12;

    // Capital required
    // For calls (covered call): Stock price * 100 shares
    // For puts (cash-secured put): Strike price * 100 shares
    const capitalRequired = type === 'call' ? S * 100 : K * 100;

    // If assigned calculations
    let assignedReturn, assignedAnnualized, effectivePrice;

    if (type === 'call') {
        // Covered call: sell stock at strike, keep premium
        // Return = (Premium + (Strike - Stock Price)) / Stock Price
        const totalReturn = premium + (K - S);
        assignedReturn = totalReturn / S;
        assignedAnnualized = assignedReturn * (365 / days);
        // Effective sell price = Strike + Premium
        effectivePrice = K + premium;
    } else {
        // Cash-secured put: buy stock at strike, keep premium
        // Effective buy price = Strike - Premium
        effectivePrice = K - premium;
        // Return = Premium / Strike (since you're committing strike amount)
        assignedReturn = premium / K;
        assignedAnnualized = assignedReturn * (365 / days);
    }

    // Update display
    updateDisplay('annualized-yield', formatYieldPercent(annualizedYield));
    updateDisplay('dte-display', days.toString());
    updateDisplay('period-yield', formatYieldPercent(periodYield));
    updateDisplay('premium-per-day', formatCurrency(premiumPerDay));
    updateDisplay('monthly-yield', formatYieldPercent(monthlyYield));
    updateDisplay('capital-required', formatCurrency(capitalRequired));

    // Update capital description based on option type
    const capitalDesc = document.getElementById('capital-desc');
    if (capitalDesc) {
        capitalDesc.textContent = type === 'call' ? 'Stock ownership (100 shares)' : 'Cash to secure put';
    }

    // If assigned section
    updateDisplay('assigned-return', formatYieldPercent(assignedReturn));
    updateDisplay('assigned-annualized', formatYieldPercent(assignedAnnualized));
    updateDisplay('effective-price', formatCurrency(effectivePrice));

    // Update assigned description based on option type
    const assignedDesc = document.getElementById('assigned-desc');
    if (assignedDesc) {
        assignedDesc.textContent = type === 'call'
            ? 'Premium + (Strike - Stock)'
            : 'Premium / Strike price';
    }

    const effectiveDesc = document.getElementById('effective-desc');
    if (effectiveDesc) {
        effectiveDesc.textContent = type === 'call'
            ? 'Net sale price if called away'
            : 'Net cost basis if assigned';
    }

    // Apply color classes based on yield quality
    applyYieldColor('annualized-yield', annualizedYield);
    applyYieldColor('period-yield', periodYield);
    applyYieldColor('monthly-yield', monthlyYield);
    applyYieldColor('assigned-annualized', assignedAnnualized);
}

/**
 * Apply color class based on yield value
 */
function applyYieldColor(elementId, yieldValue) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.remove('excellent', 'good', 'moderate', 'low', 'negative');

    if (yieldValue < 0) {
        el.classList.add('negative');
    } else if (yieldValue >= 0.30) { // 30%+ annualized
        el.classList.add('excellent');
    } else if (yieldValue >= 0.15) { // 15-30%
        el.classList.add('good');
    } else if (yieldValue >= 0.08) { // 8-15%
        el.classList.add('moderate');
    } else {
        el.classList.add('low');
    }
}

/**
 * Format yield as percentage with 2 decimal places
 */
function formatYieldPercent(value) {
    if (isNaN(value) || !isFinite(value)) return '--%';
    return (value * 100).toFixed(2) + '%';
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
