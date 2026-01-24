/**
 * Black-Scholes Option Pricing Model
 * Calculates European option prices and Greeks
 */

const BlackScholes = {
    /**
     * Standard normal cumulative distribution function
     * Uses Abramowitz & Stegun approximation (error < 7.5e-8)
     */
    normCDF(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return 0.5 * (1.0 + sign * y);
    },

    /**
     * Standard normal probability density function
     */
    normPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    },

    /**
     * Calculate d1 and d2 parameters
     * @param {number} S - Current stock price
     * @param {number} K - Strike price
     * @param {number} T - Time to expiration (in years)
     * @param {number} r - Risk-free interest rate (decimal)
     * @param {number} sigma - Volatility (decimal)
     * @param {number} q - Dividend yield (decimal)
     */
    calculateD1D2(S, K, T, r, sigma, q) {
        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        return { d1, d2 };
    },

    /**
     * Calculate option price
     * @param {string} type - 'call' or 'put'
     * @param {number} S - Current stock price
     * @param {number} K - Strike price
     * @param {number} T - Time to expiration (in years)
     * @param {number} r - Risk-free interest rate (decimal)
     * @param {number} sigma - Volatility (decimal)
     * @param {number} q - Dividend yield (decimal)
     */
    price(type, S, K, T, r, sigma, q = 0) {
        if (T <= 0) {
            // At expiration
            if (type === 'call') {
                return Math.max(0, S - K);
            } else {
                return Math.max(0, K - S);
            }
        }

        const { d1, d2 } = this.calculateD1D2(S, K, T, r, sigma, q);

        if (type === 'call') {
            return S * Math.exp(-q * T) * this.normCDF(d1) - K * Math.exp(-r * T) * this.normCDF(d2);
        } else {
            return K * Math.exp(-r * T) * this.normCDF(-d2) - S * Math.exp(-q * T) * this.normCDF(-d1);
        }
    },

    /**
     * Calculate Delta - rate of change of option price with respect to underlying price
     */
    delta(type, S, K, T, r, sigma, q = 0) {
        if (T <= 0) {
            if (type === 'call') {
                return S > K ? 1 : 0;
            } else {
                return S < K ? -1 : 0;
            }
        }

        const { d1 } = this.calculateD1D2(S, K, T, r, sigma, q);
        const expQt = Math.exp(-q * T);

        if (type === 'call') {
            return expQt * this.normCDF(d1);
        } else {
            return expQt * (this.normCDF(d1) - 1);
        }
    },

    /**
     * Calculate Gamma - rate of change of delta with respect to underlying price
     */
    gamma(S, K, T, r, sigma, q = 0) {
        if (T <= 0) return 0;

        const { d1 } = this.calculateD1D2(S, K, T, r, sigma, q);
        const expQt = Math.exp(-q * T);

        return expQt * this.normPDF(d1) / (S * sigma * Math.sqrt(T));
    },

    /**
     * Calculate Theta - rate of change of option price with respect to time
     * Returns daily theta (divide annual by 365)
     */
    theta(type, S, K, T, r, sigma, q = 0) {
        if (T <= 0) return 0;

        const { d1, d2 } = this.calculateD1D2(S, K, T, r, sigma, q);
        const expQt = Math.exp(-q * T);
        const expRt = Math.exp(-r * T);
        const sqrtT = Math.sqrt(T);

        const term1 = -(S * sigma * expQt * this.normPDF(d1)) / (2 * sqrtT);

        if (type === 'call') {
            const term2 = -r * K * expRt * this.normCDF(d2);
            const term3 = q * S * expQt * this.normCDF(d1);
            return (term1 + term2 + term3) / 365;
        } else {
            const term2 = r * K * expRt * this.normCDF(-d2);
            const term3 = -q * S * expQt * this.normCDF(-d1);
            return (term1 + term2 + term3) / 365;
        }
    },

    /**
     * Calculate Vega - rate of change of option price with respect to volatility
     * Returns vega per 1% change in volatility
     */
    vega(S, K, T, r, sigma, q = 0) {
        if (T <= 0) return 0;

        const { d1 } = this.calculateD1D2(S, K, T, r, sigma, q);
        const expQt = Math.exp(-q * T);

        return (S * expQt * this.normPDF(d1) * Math.sqrt(T)) / 100;
    },

    /**
     * Calculate Rho - rate of change of option price with respect to interest rate
     * Returns rho per 1% change in interest rate
     */
    rho(type, S, K, T, r, sigma, q = 0) {
        if (T <= 0) return 0;

        const { d2 } = this.calculateD1D2(S, K, T, r, sigma, q);
        const expRt = Math.exp(-r * T);

        if (type === 'call') {
            return (K * T * expRt * this.normCDF(d2)) / 100;
        } else {
            return (-K * T * expRt * this.normCDF(-d2)) / 100;
        }
    },

    /**
     * Calculate all Greeks at once
     */
    calculateAll(type, S, K, T, r, sigma, q = 0) {
        return {
            price: this.price(type, S, K, T, r, sigma, q),
            delta: this.delta(type, S, K, T, r, sigma, q),
            gamma: this.gamma(S, K, T, r, sigma, q),
            theta: this.theta(type, S, K, T, r, sigma, q),
            vega: this.vega(S, K, T, r, sigma, q),
            rho: this.rho(type, S, K, T, r, sigma, q)
        };
    },

    /**
     * Calculate intrinsic value
     */
    intrinsicValue(type, S, K) {
        if (type === 'call') {
            return Math.max(0, S - K);
        } else {
            return Math.max(0, K - S);
        }
    },

    /**
     * Calculate probability of finishing in-the-money
     * Based on risk-neutral probability (N(d2) for calls, N(-d2) for puts)
     */
    probITM(type, S, K, T, r, sigma, q = 0) {
        if (T <= 0) {
            if (type === 'call') {
                return S > K ? 1 : 0;
            } else {
                return S < K ? 1 : 0;
            }
        }

        const { d2 } = this.calculateD1D2(S, K, T, r, sigma, q);

        if (type === 'call') {
            return this.normCDF(d2);
        } else {
            return this.normCDF(-d2);
        }
    },

    /**
     * Calculate breakeven price at expiration
     */
    breakeven(type, K, premium) {
        if (type === 'call') {
            return K + premium;
        } else {
            return K - premium;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlackScholes;
}
