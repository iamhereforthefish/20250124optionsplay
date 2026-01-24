/**
 * Options Yield Finder - Main Application
 * Focus on finding highest yielding options to sell
 * All data from MarketData.app API
 */

// MarketData.app API configuration
const MARKETDATA_API = {
    baseUrl: 'https://api.marketdata.app/v1',
    token: 'X0htSHRqcThNTGJuOUVOb1YxQVRMcGN3cl9XdTd2Y3lrV2ZWN2wzc2FQMD0'
};

// Application state
let currentOptionType = 'put'; // Default to put for selling
let currentTicker = '';
let currentStockPrice = 0;
let currentExpiration = '';
let currentStrike = 0;
let currentDaysToMaturity = 0;
let expirationDates = [];
let strikePrices = [];
let optionChainData = null;

// Debounce timer
let tickerDebounceTimer = null;

/**
 * Set the option type (call or put)
 */
function setOptionType(type) {
    currentOptionType = type;

    // Update UI
    document.querySelectorAll('.option-type-selector .toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === type) {
            btn.classList.add('active');
        }
    });

    // If we have data, refresh the strike dropdown and recalculate
    if (currentExpiration && currentTicker) {
        fetchStrikes(currentTicker, currentExpiration);
    }
}

/**
 * Debounced ticker input handler
 */
function onTickerInput(e) {
    const ticker = e.target.value.trim().toUpperCase();

    clearTimeout(tickerDebounceTimer);

    if (ticker.length >= 1 && ticker.length <= 5) {
        const statusEl = document.getElementById('fetch-status');
        statusEl.textContent = 'Fetching...';
        statusEl.className = 'status-message loading';

        tickerDebounceTimer = setTimeout(() => {
            fetchMarketData(ticker);
        }, 500);
    }
}

/**
 * Fetch all market data for a ticker
 */
async function fetchMarketData(ticker) {
    if (!ticker) {
        ticker = document.getElementById('ticker').value.trim().toUpperCase();
    }

    if (!ticker) return;

    currentTicker = ticker;
    const statusEl = document.getElementById('fetch-status');

    try {
        // Fetch stock quote
        const stockData = await fetchStockQuote(ticker);
        currentStockPrice = stockData.price;

        // Update stock display
        document.getElementById('stock-price-display').textContent = '$' + stockData.price.toFixed(2);
        document.getElementById('stock-bid').textContent = stockData.bid ? '$' + stockData.bid.toFixed(2) : '--';
        document.getElementById('stock-ask').textContent = stockData.ask ? '$' + stockData.ask.toFixed(2) : '--';

        // Update stock name
        const stockNameEl = document.getElementById('stock-name');
        if (stockData.name) {
            stockNameEl.textContent = stockData.name;
            stockNameEl.style.display = 'block';
        } else {
            stockNameEl.textContent = ticker;
            stockNameEl.style.display = 'block';
        }

        // Fetch expiration dates
        await fetchExpirations(ticker);

        statusEl.textContent = `Loaded: ${ticker}`;
        statusEl.className = 'status-message success';

    } catch (error) {
        console.error('Error fetching data:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-message error';
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
        name: data.name ? data.name[0] : null
    };
}

/**
 * Fetch expiration dates from MarketData.app
 */
async function fetchExpirations(ticker) {
    const url = `${MARKETDATA_API.baseUrl}/options/expirations/${ticker}/`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch expiration dates');
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.expirations || data.expirations.length === 0) {
        throw new Error('No options available for this symbol');
    }

    expirationDates = data.expirations;

    // Populate expiration dropdown
    const select = document.getElementById('expiration-select');
    select.innerHTML = '<option value="">-- Select Expiration --</option>';

    expirationDates.forEach(exp => {
        const option = document.createElement('option');
        option.value = exp;
        // Format date for display
        const date = new Date(exp + 'T00:00:00');
        const formatted = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const days = calculateDaysToExpiry(exp);
        option.textContent = `${formatted} (${days} days)`;
        select.appendChild(option);
    });
}

/**
 * Calculate days to expiry from date string
 */
function calculateDaysToExpiry(expirationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expirationDate + 'T00:00:00');
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
}

/**
 * Handle expiration date selection
 */
async function onExpirationChange() {
    const select = document.getElementById('expiration-select');
    currentExpiration = select.value;

    if (!currentExpiration) {
        document.getElementById('days-to-maturity').textContent = '--';
        return;
    }

    // Calculate and display days to maturity
    currentDaysToMaturity = calculateDaysToExpiry(currentExpiration);
    document.getElementById('days-to-maturity').textContent = currentDaysToMaturity + ' days';

    // Fetch strikes for this expiration
    if (currentTicker) {
        await fetchStrikes(currentTicker, currentExpiration);
    }
}

/**
 * Fetch strike prices for an expiration
 */
async function fetchStrikes(ticker, expiration) {
    const url = `${MARKETDATA_API.baseUrl}/options/strikes/${ticker}/?expiration=${expiration}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Token ${MARKETDATA_API.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch strikes');
        }

        const data = await response.json();

        if (data.s !== 'ok' || !data.strikes || data.strikes.length === 0) {
            throw new Error('No strikes available');
        }

        strikePrices = data.strikes.sort((a, b) => a - b);

        // Populate strike dropdown
        const select = document.getElementById('strike-select');
        select.innerHTML = '<option value="">-- Select Strike --</option>';

        // Find ATM strike
        const atmStrike = strikePrices.reduce((prev, curr) =>
            Math.abs(curr - currentStockPrice) < Math.abs(prev - currentStockPrice) ? curr : prev
        );

        strikePrices.forEach(strike => {
            const option = document.createElement('option');
            option.value = strike;

            // Mark OTM/ATM/ITM
            let label = '$' + strike.toFixed(2);
            if (currentOptionType === 'put') {
                if (strike < currentStockPrice * 0.98) label += ' (OTM)';
                else if (strike > currentStockPrice * 1.02) label += ' (ITM)';
                else label += ' (ATM)';
            } else {
                if (strike > currentStockPrice * 1.02) label += ' (OTM)';
                else if (strike < currentStockPrice * 0.98) label += ' (ITM)';
                else label += ' (ATM)';
            }

            option.textContent = label;

            // Pre-select ATM or slightly OTM
            if (strike === atmStrike) {
                option.selected = true;
                currentStrike = strike;
            }

            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error fetching strikes:', error);
    }
}

/**
 * Handle strike price selection
 */
function onStrikeChange() {
    const select = document.getElementById('strike-select');
    currentStrike = parseFloat(select.value);
}

/**
 * Fetch option quote (main action)
 */
async function fetchOptionQuote() {
    if (!currentTicker || !currentExpiration || !currentStrike) {
        alert('Please select a ticker, expiration date, and strike price');
        return;
    }

    const statusEl = document.getElementById('fetch-status');
    statusEl.textContent = 'Fetching option quote...';
    statusEl.className = 'status-message loading';

    try {
        // Build option symbol (OCC format)
        const optionSymbol = buildOptionSymbol(currentTicker, currentExpiration, currentOptionType, currentStrike);

        // Fetch option quote
        const optionData = await fetchOptionData(optionSymbol);

        // Show option quote section
        document.getElementById('option-quote-section').style.display = 'block';

        // Update option quote display
        const bid = optionData.bid || 0;
        const ask = optionData.ask || 0;
        const mid = (bid + ask) / 2; // Current price = average of bid and ask

        // Current Price (Mid) - Hero display - used for yield calculation
        document.getElementById('current-price').textContent = '$' + mid.toFixed(2);

        // Bid/Ask display
        document.getElementById('option-bid').textContent = '$' + bid.toFixed(2);
        document.getElementById('option-ask').textContent = '$' + ask.toFixed(2);
        document.getElementById('option-last').textContent = optionData.last ? '$' + optionData.last.toFixed(2) : '--';

        // Volume and Open Interest
        document.getElementById('option-volume').textContent = optionData.volume ? optionData.volume.toLocaleString() : '--';
        document.getElementById('option-oi').textContent = optionData.openInterest ? optionData.openInterest.toLocaleString() : '--';

        // Implied Volatility
        document.getElementById('option-iv').textContent = optionData.iv ? (optionData.iv * 100).toFixed(1) + '%' : '--';

        // Update Greeks from market data
        updateDisplay('delta', optionData.delta ? optionData.delta.toFixed(4) : '--');
        updateDisplay('gamma', optionData.gamma ? optionData.gamma.toFixed(4) : '--');
        updateDisplay('theta', optionData.theta ? optionData.theta.toFixed(4) : '--');
        updateDisplay('vega', optionData.vega ? optionData.vega.toFixed(4) : '--');
        updateDisplay('rho', optionData.rho ? optionData.rho.toFixed(4) : '--');

        // Calculate Black-Scholes for comparison
        const iv = optionData.iv || 0.25;
        const T = currentDaysToMaturity / 365;
        const r = 0.0525; // Risk-free rate
        const bsPrice = BlackScholes.price(currentOptionType, currentStockPrice, currentStrike, T, r, iv, 0);
        const intrinsic = BlackScholes.intrinsicValue(currentOptionType, currentStockPrice, currentStrike);
        const timeValue = mid - intrinsic;

        document.getElementById('bs-price').textContent = '$' + bsPrice.toFixed(2);
        document.getElementById('intrinsic-value').textContent = '$' + intrinsic.toFixed(2);
        document.getElementById('time-value').textContent = '$' + Math.max(0, timeValue).toFixed(2);

        // Calculate yield analysis using MID price (average of bid and ask)
        calculateYieldAnalysis(currentStockPrice, currentStrike, currentDaysToMaturity, mid, currentOptionType);

        // Update P/L chart
        if (typeof PLChart !== 'undefined') {
            PLChart.update(currentOptionType, currentStockPrice, currentStrike, T, r, iv, 0, bid, 1);
        }

        statusEl.textContent = `Quote loaded for ${optionSymbol}`;
        statusEl.className = 'status-message success';

    } catch (error) {
        console.error('Error fetching option quote:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-message error';
    }
}

/**
 * Build OCC option symbol
 * Format: SYMBOL + YYMMDD + C/P + Strike (8 digits, strike * 1000)
 */
function buildOptionSymbol(ticker, expiration, type, strike) {
    const expDate = new Date(expiration + 'T00:00:00');
    const yy = String(expDate.getFullYear()).slice(-2);
    const mm = String(expDate.getMonth() + 1).padStart(2, '0');
    const dd = String(expDate.getDate()).padStart(2, '0');
    const cp = type === 'call' ? 'C' : 'P';
    const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');

    return `${ticker}${yy}${mm}${dd}${cp}${strikeStr}`;
}

/**
 * Fetch option data from MarketData.app
 */
async function fetchOptionData(optionSymbol) {
    const url = `${MARKETDATA_API.baseUrl}/options/quotes/${optionSymbol}/`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!response.ok) {
        // Try alternative: fetch from chain
        return await fetchOptionFromChain();
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
        rho: data.rho ? data.rho[0] : null,
        openInterest: data.openInterest ? data.openInterest[0] : null,
        volume: data.volume ? data.volume[0] : null
    };
}

/**
 * Alternative: fetch option from chain endpoint
 */
async function fetchOptionFromChain() {
    const side = currentOptionType === 'call' ? 'call' : 'put';
    const url = `${MARKETDATA_API.baseUrl}/options/chain/${currentTicker}/?expiration=${currentExpiration}&side=${side}&strike=${currentStrike}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Token ${MARKETDATA_API.token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch option data');
    }

    const data = await response.json();

    if (data.s !== 'ok' || !data.bid || data.bid.length === 0) {
        throw new Error('No option data available');
    }

    // Find the matching strike
    const idx = data.strike ? data.strike.findIndex(s => Math.abs(s - currentStrike) < 0.01) : 0;

    return {
        bid: data.bid ? data.bid[idx] : null,
        ask: data.ask ? data.ask[idx] : null,
        last: data.last ? data.last[idx] : null,
        iv: data.iv ? data.iv[idx] : null,
        delta: data.delta ? data.delta[idx] : null,
        gamma: data.gamma ? data.gamma[idx] : null,
        theta: data.theta ? data.theta[idx] : null,
        vega: data.vega ? data.vega[idx] : null,
        rho: data.rho ? data.rho[idx] : null,
        openInterest: data.openInterest ? data.openInterest[idx] : null,
        volume: data.volume ? data.volume[idx] : null
    };
}

/**
 * Calculate and display seller's yield analysis
 */
function calculateYieldAnalysis(S, K, days, premium, type) {
    if (!premium || premium <= 0) {
        resetYieldDisplay();
        return;
    }

    // Period yield: Premium / Stock Price
    const periodYield = premium / S;

    // Annualized yield: Period yield * (365 / days)
    const annualizedYield = periodYield * (365 / days);

    // Premium per day
    const premiumPerDay = premium / days;

    // Monthly equivalent yield
    const monthlyYield = annualizedYield / 12;

    // Capital required
    const capitalRequired = type === 'call' ? S * 100 : K * 100;

    // If assigned calculations
    let assignedReturn, assignedAnnualized, effectivePrice;

    if (type === 'call') {
        const totalReturn = premium + (K - S);
        assignedReturn = totalReturn / S;
        assignedAnnualized = assignedReturn * (365 / days);
        effectivePrice = K + premium;
    } else {
        effectivePrice = K - premium;
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

    const capitalDesc = document.getElementById('capital-desc');
    if (capitalDesc) {
        capitalDesc.textContent = type === 'call' ? 'Stock ownership (100 shares)' : 'Cash to secure put';
    }

    updateDisplay('assigned-return', formatYieldPercent(assignedReturn));
    updateDisplay('assigned-annualized', formatYieldPercent(assignedAnnualized));
    updateDisplay('effective-price', formatCurrency(effectivePrice));

    const assignedDesc = document.getElementById('assigned-desc');
    if (assignedDesc) {
        assignedDesc.textContent = type === 'call' ? 'Premium + (Strike - Stock)' : 'Premium / Strike price';
    }

    const effectiveDesc = document.getElementById('effective-desc');
    if (effectiveDesc) {
        effectiveDesc.textContent = type === 'call' ? 'Net sale price if called away' : 'Net cost basis if assigned';
    }

    applyYieldColor('annualized-yield', annualizedYield);
    applyYieldColor('period-yield', periodYield);
    applyYieldColor('monthly-yield', monthlyYield);
    applyYieldColor('assigned-annualized', assignedAnnualized);
}

/**
 * Reset yield display
 */
function resetYieldDisplay() {
    ['annualized-yield', 'period-yield', 'premium-per-day', 'monthly-yield',
     'capital-required', 'assigned-return', 'assigned-annualized', 'effective-price'].forEach(id => {
        updateDisplay(id, '--');
    });
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
    } else if (yieldValue >= 0.30) {
        el.classList.add('excellent');
    } else if (yieldValue >= 0.15) {
        el.classList.add('good');
    } else if (yieldValue >= 0.08) {
        el.classList.add('moderate');
    } else {
        el.classList.add('low');
    }
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
 * Format yield as percentage
 */
function formatYieldPercent(value) {
    if (isNaN(value) || !isFinite(value)) return '--%';
    return (value * 100).toFixed(2) + '%';
}

/**
 * Initialize the application
 */
function init() {
    const tickerInput = document.getElementById('ticker');

    // Auto-fetch on ticker input
    tickerInput.addEventListener('input', onTickerInput);

    // Fetch on Enter key
    tickerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(tickerDebounceTimer);
            fetchMarketData();
        }
    });

    // Set default position to short (selling options)
    if (typeof PLChart !== 'undefined') {
        PLChart.position = 'short';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
