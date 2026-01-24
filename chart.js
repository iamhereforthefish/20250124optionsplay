/**
 * Profit/Loss Chart for Options
 * Uses HTML5 Canvas for rendering
 */

const PLChart = {
    canvas: null,
    ctx: null,
    tooltip: null,
    data: null,
    position: 'long',

    // Chart colors (light theme)
    colors: {
        primary: '#0d7377',
        purple: '#7c3aed',
        success: '#047857',
        danger: '#dc2626',
        warning: '#d97706',
        text: '#0f172a',
        textSecondary: '#334155',
        grid: '#44C1C1',
        background: '#ffffff',
        zero: '#2d9a9a'
    },

    // Chart padding
    padding: {
        top: 30,
        right: 60,
        bottom: 50,
        left: 70
    },

    /**
     * Initialize the chart
     */
    init() {
        this.canvas = document.getElementById('pl-chart');
        this.tooltip = document.getElementById('chart-tooltip');

        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        this.setupEventListeners();
    },

    /**
     * Setup canvas for high DPI displays
     */
    setupCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
    },

    /**
     * Setup mouse event listeners for tooltip
     */
    setupEventListeners() {
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.hideTooltip());

        window.addEventListener('resize', () => {
            this.setupCanvas();
            if (this.data) this.render();
        });
    },

    /**
     * Calculate P/L data points
     */
    calculatePLData(type, S, K, T, r, sigma, q, premium, contracts, position) {
        const multiplier = position === 'long' ? 1 : -1;
        const contractSize = 100; // Standard options contract

        // Price range: 50% below to 50% above current price
        const minPrice = Math.max(0.01, S * 0.5);
        const maxPrice = S * 1.5;
        const step = (maxPrice - minPrice) / 200;

        const expiryData = [];
        const currentData = [];

        for (let price = minPrice; price <= maxPrice; price += step) {
            // P/L at expiration
            let expiryPL;
            if (type === 'call') {
                expiryPL = (Math.max(0, price - K) - premium) * multiplier;
            } else {
                expiryPL = (Math.max(0, K - price) - premium) * multiplier;
            }
            expiryPL *= contractSize * contracts;
            expiryData.push({ price, pl: expiryPL });

            // Current P/L (using Black-Scholes)
            if (T > 0) {
                const currentValue = BlackScholes.price(type, price, K, T, r, sigma, q);
                let currentPL = (currentValue - premium) * multiplier;
                currentPL *= contractSize * contracts;
                currentData.push({ price, pl: currentPL });
            }
        }

        // Calculate breakeven
        let breakeven;
        if (position === 'long') {
            breakeven = type === 'call' ? K + premium : K - premium;
        } else {
            breakeven = type === 'call' ? K + premium : K - premium;
        }

        // Calculate max profit/loss
        let maxProfit, maxLoss;
        if (type === 'call') {
            if (position === 'long') {
                maxProfit = Infinity;
                maxLoss = premium * contractSize * contracts;
            } else {
                maxProfit = premium * contractSize * contracts;
                maxLoss = Infinity;
            }
        } else {
            if (position === 'long') {
                maxProfit = (K - premium) * contractSize * contracts;
                maxLoss = premium * contractSize * contracts;
            } else {
                maxProfit = premium * contractSize * contracts;
                maxLoss = (K - premium) * contractSize * contracts;
            }
        }

        return {
            expiryData,
            currentData,
            breakeven,
            maxProfit,
            maxLoss,
            currentPrice: S,
            strike: K
        };
    },

    /**
     * Update chart with new data
     */
    update(type, S, K, T, r, sigma, q, premium, contracts) {
        this.data = this.calculatePLData(type, S, K, T, r, sigma, q, premium, contracts, this.position);
        this.data.type = type;
        this.data.premium = premium;
        this.data.contracts = contracts;
        this.data.T = T;

        this.render();
        this.updateStats();
    },

    /**
     * Render the chart
     */
    render() {
        if (!this.data || !this.ctx) return;

        const ctx = this.ctx;
        const { expiryData, currentData, breakeven, currentPrice, strike } = this.data;

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.width, this.height);

        // Calculate scales
        const chartWidth = this.width - this.padding.left - this.padding.right;
        const chartHeight = this.height - this.padding.top - this.padding.bottom;

        const allPL = [...expiryData.map(d => d.pl), ...currentData.map(d => d.pl)];
        const minPL = Math.min(...allPL);
        const maxPL = Math.max(...allPL);
        const plRange = Math.max(Math.abs(minPL), Math.abs(maxPL)) * 1.1;

        const priceMin = expiryData[0].price;
        const priceMax = expiryData[expiryData.length - 1].price;

        const scaleX = (price) => this.padding.left + ((price - priceMin) / (priceMax - priceMin)) * chartWidth;
        const scaleY = (pl) => this.padding.top + chartHeight / 2 - (pl / plRange) * (chartHeight / 2);

        // Draw grid
        this.drawGrid(ctx, chartWidth, chartHeight, priceMin, priceMax, plRange, scaleX, scaleY);

        // Draw zero line
        ctx.strokeStyle = this.colors.zero;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(this.padding.left, scaleY(0));
        ctx.lineTo(this.width - this.padding.right, scaleY(0));
        ctx.stroke();

        // Draw current P/L line (if we have time value)
        if (currentData.length > 0 && this.data.T > 0) {
            ctx.strokeStyle = this.colors.purple;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            currentData.forEach((point, i) => {
                const x = scaleX(point.price);
                const y = scaleY(point.pl);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Draw expiry P/L line
        ctx.strokeStyle = this.colors.primary;
        ctx.lineWidth = 3;
        ctx.beginPath();
        expiryData.forEach((point, i) => {
            const x = scaleX(point.price);
            const y = scaleY(point.pl);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Fill profit/loss areas
        this.fillPLAreas(ctx, expiryData, scaleX, scaleY);

        // Draw breakeven marker
        if (breakeven >= priceMin && breakeven <= priceMax) {
            const beX = scaleX(breakeven);
            const beY = scaleY(0);

            ctx.fillStyle = this.colors.warning;
            ctx.beginPath();
            ctx.arc(beX, beY, 6, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = this.colors.warning;
            ctx.font = '11px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('BE: $' + breakeven.toFixed(2), beX, beY - 12);
        }

        // Draw current price marker
        const cpX = scaleX(currentPrice);
        ctx.strokeStyle = this.colors.text;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cpX, this.padding.top);
        ctx.lineTo(cpX, this.height - this.padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = this.colors.text;
        ctx.beginPath();
        ctx.arc(cpX, scaleY(0), 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw strike price marker
        const stX = scaleX(strike);
        ctx.strokeStyle = this.colors.textSecondary;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(stX, this.padding.top);
        ctx.lineTo(stX, this.height - this.padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Store scale functions for tooltip
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.priceMin = priceMin;
        this.priceMax = priceMax;
    },

    /**
     * Draw grid lines and labels
     */
    drawGrid(ctx, chartWidth, chartHeight, priceMin, priceMax, plRange, scaleX, scaleY) {
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.3;

        // Vertical grid lines (price)
        const priceStep = (priceMax - priceMin) / 8;
        for (let i = 0; i <= 8; i++) {
            const price = priceMin + i * priceStep;
            const x = scaleX(price);

            ctx.beginPath();
            ctx.moveTo(x, this.padding.top);
            ctx.lineTo(x, this.height - this.padding.bottom);
            ctx.stroke();
        }

        // Horizontal grid lines (P/L)
        const plStep = plRange / 4;
        for (let i = -4; i <= 4; i++) {
            const pl = i * plStep;
            const y = scaleY(pl);

            if (y >= this.padding.top && y <= this.height - this.padding.bottom) {
                ctx.beginPath();
                ctx.moveTo(this.padding.left, y);
                ctx.lineTo(this.width - this.padding.right, y);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;

        // Axis labels
        ctx.fillStyle = this.colors.textSecondary;
        ctx.font = '11px -apple-system, sans-serif';

        // X-axis labels (price)
        ctx.textAlign = 'center';
        for (let i = 0; i <= 8; i += 2) {
            const price = priceMin + i * priceStep;
            const x = scaleX(price);
            ctx.fillText('$' + price.toFixed(0), x, this.height - this.padding.bottom + 20);
        }

        // X-axis title
        ctx.fillText('Stock Price at Expiration', this.width / 2, this.height - 10);

        // Y-axis labels (P/L)
        ctx.textAlign = 'right';
        for (let i = -4; i <= 4; i += 2) {
            const pl = i * plStep;
            const y = scaleY(pl);

            if (y >= this.padding.top && y <= this.height - this.padding.bottom) {
                const label = pl >= 0 ? '+$' + pl.toFixed(0) : '-$' + Math.abs(pl).toFixed(0);
                ctx.fillText(label, this.padding.left - 10, y + 4);
            }
        }

        // Y-axis title
        ctx.save();
        ctx.translate(15, this.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('Profit / Loss', 0, 0);
        ctx.restore();
    },

    /**
     * Fill profit and loss areas with color
     */
    fillPLAreas(ctx, data, scaleX, scaleY) {
        const zeroY = scaleY(0);

        // Profit area (green)
        ctx.fillStyle = this.colors.success;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();

        let inProfit = false;
        data.forEach((point, i) => {
            const x = scaleX(point.price);
            const y = scaleY(point.pl);

            if (point.pl > 0) {
                if (!inProfit) {
                    ctx.moveTo(x, zeroY);
                    inProfit = true;
                }
                ctx.lineTo(x, y);
            } else if (inProfit) {
                ctx.lineTo(x, zeroY);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                inProfit = false;
            }
        });

        if (inProfit) {
            const lastPoint = data[data.length - 1];
            ctx.lineTo(scaleX(lastPoint.price), zeroY);
            ctx.closePath();
            ctx.fill();
        }

        // Loss area (red)
        ctx.fillStyle = this.colors.danger;
        ctx.beginPath();

        let inLoss = false;
        data.forEach((point, i) => {
            const x = scaleX(point.price);
            const y = scaleY(point.pl);

            if (point.pl < 0) {
                if (!inLoss) {
                    ctx.moveTo(x, zeroY);
                    inLoss = true;
                }
                ctx.lineTo(x, y);
            } else if (inLoss) {
                ctx.lineTo(x, zeroY);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                inLoss = false;
            }
        });

        if (inLoss) {
            const lastPoint = data[data.length - 1];
            ctx.lineTo(scaleX(lastPoint.price), zeroY);
            ctx.closePath();
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    },

    /**
     * Handle mouse move for tooltip
     */
    handleMouseMove(e) {
        if (!this.data || !this.scaleX) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if within chart area
        if (x < this.padding.left || x > this.width - this.padding.right) {
            this.hideTooltip();
            return;
        }

        // Calculate price at cursor
        const chartWidth = this.width - this.padding.left - this.padding.right;
        const priceRatio = (x - this.padding.left) / chartWidth;
        const price = this.priceMin + priceRatio * (this.priceMax - this.priceMin);

        // Find corresponding P/L
        const { expiryData, currentData } = this.data;
        const expiryPoint = this.findClosestPoint(expiryData, price);
        const currentPoint = currentData.length > 0 ? this.findClosestPoint(currentData, price) : null;

        // Show tooltip
        this.showTooltip(e.clientX, e.clientY, price, expiryPoint.pl, currentPoint ? currentPoint.pl : null);
    },

    /**
     * Find closest data point to given price
     */
    findClosestPoint(data, price) {
        let closest = data[0];
        let minDiff = Math.abs(data[0].price - price);

        for (const point of data) {
            const diff = Math.abs(point.price - price);
            if (diff < minDiff) {
                minDiff = diff;
                closest = point;
            }
        }

        return closest;
    },

    /**
     * Show tooltip
     */
    showTooltip(mouseX, mouseY, price, expiryPL, currentPL) {
        const tooltip = this.tooltip;
        if (!tooltip) return;

        let html = `<div style="color: #f1f5f9; font-weight: 600;">Price: $${price.toFixed(2)}</div>`;

        const expiryClass = expiryPL >= 0 ? 'color: #10b981' : 'color: #ef4444';
        const expirySign = expiryPL >= 0 ? '+' : '';
        html += `<div style="${expiryClass}">At Expiry: ${expirySign}$${expiryPL.toFixed(2)}</div>`;

        if (currentPL !== null) {
            const currentClass = currentPL >= 0 ? 'color: #10b981' : 'color: #ef4444';
            const currentSign = currentPL >= 0 ? '+' : '';
            html += `<div style="${currentClass}">Current: ${currentSign}$${currentPL.toFixed(2)}</div>`;
        }

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';

        // Position tooltip
        const rect = this.canvas.parentElement.getBoundingClientRect();
        let left = mouseX - rect.left + 15;
        let top = mouseY - rect.top - 10;

        // Keep tooltip within bounds
        if (left + 150 > rect.width) {
            left = mouseX - rect.left - 160;
        }

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    },

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    },

    /**
     * Update stats display
     */
    updateStats() {
        if (!this.data) return;

        const { maxProfit, maxLoss, breakeven, contracts } = this.data;

        // Max Profit
        const maxProfitEl = document.getElementById('max-profit');
        if (maxProfitEl) {
            if (maxProfit === Infinity) {
                maxProfitEl.textContent = 'Unlimited';
            } else {
                maxProfitEl.textContent = '+$' + maxProfit.toFixed(2);
            }
        }

        // Max Loss
        const maxLossEl = document.getElementById('max-loss');
        if (maxLossEl) {
            if (maxLoss === Infinity) {
                maxLossEl.textContent = 'Unlimited';
            } else {
                maxLossEl.textContent = '-$' + maxLoss.toFixed(2);
            }
        }

        // Risk/Reward
        const rrEl = document.getElementById('risk-reward');
        if (rrEl) {
            if (maxProfit === Infinity || maxLoss === Infinity) {
                rrEl.textContent = maxProfit === Infinity ? 'Unlimited' : '0';
            } else if (maxLoss > 0) {
                rrEl.textContent = (maxProfit / maxLoss).toFixed(2) + ':1';
            } else {
                rrEl.textContent = '--';
            }
        }

        // Breakeven
        const beEl = document.getElementById('chart-breakeven');
        if (beEl) {
            beEl.textContent = '$' + breakeven.toFixed(2);
        }
    },

    /**
     * Set position (long/short)
     */
    setPosition(position) {
        this.position = position;
    }
};

// Global function for position toggle
function setPosition(position) {
    PLChart.setPosition(position);

    // Update UI
    document.querySelectorAll('.chart-toggle .toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.position === position) {
            btn.classList.add('active');
        }
    });

    // Recalculate if we have data
    updateChart();
}

// Global function to update chart
function updateChart() {
    // Get current values
    const S = parseFloat(document.getElementById('stock-price').value);
    const K = parseFloat(document.getElementById('strike-price').value);
    const days = parseFloat(document.getElementById('time-to-expiry').value);
    const sigma = parseFloat(document.getElementById('volatility').value) / 100;
    const r = parseFloat(document.getElementById('risk-free-rate').value) / 100;
    const q = parseFloat(document.getElementById('dividend-yield').value) / 100;
    const contracts = parseInt(document.getElementById('num-contracts').value) || 1;

    if (isNaN(S) || isNaN(K) || isNaN(days) || isNaN(sigma)) return;

    const T = days / 365;
    const premium = BlackScholes.price(currentOptionType, S, K, T, r, sigma, q);

    PLChart.update(currentOptionType, S, K, T, r, sigma, q, premium, contracts);
}

// Initialize chart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    PLChart.init();
});
