    // JS Logic Outline
    // 1. Define State / Inputs
    // 2. Initialize UI Controls and bind to State
    // 3. Define Simulation Core Logic (Year by year loop)
    // 4. FERS & SS Calculators
    // 5. Tax & Withdrawal Logic
    // 6. Chart Rendering
    // 7. Event Listeners for Input Changes -> trigger Simulation -> trigger Chart Update


    const uiFields = [
        "currentAge", "targetAge", "annualExpenses", "inflationRate", "taxFilingStatus", "stateOfResidence",
        "fehbPremium", "acaPremium", "yearsOfService", "startingSalary", "high3Salary", "ssStartAge",
        "fersMraPreference", "veraEligible", "tradTspBalance", "tradTspContrib", "rothTspBalance", "rothTspContrib",
        "tradIraBalance", "tradIraContrib", "rothIraBalance", "rothIraContrib", "taxableBalance", "taxableContrib",
        "taxableCostBasis", "hysaBalance", "hysaContrib", "marketReturn", "cashYield"
    ];

    const App = {
        state: {},

        formatNumber: function(num) {
            if (isNaN(num)) return "0";
            return Number(num).toLocaleString('en-US');
        },
        parseNumber: function(str) {
            if (str === undefined || str === null) return 0;
            return parseFloat(str.toString().replace(/,/g, '')) || 0;
        },

        init: function() {
            this.bindSliders();
            this.bindInputs();
            this.updateState();
            // Initial run
            this.runSimulation();
        },

        bindSliders: function() {
            uiFields.forEach(id => {
                const textInput = document.getElementById(id);
                const sliderInput = document.getElementById(id + '_slider');
                if (textInput && sliderInput) {
                    // Initialize with formatted value
                    textInput.value = this.formatNumber(sliderInput.value);

                    sliderInput.addEventListener('input', (e) => {
                        textInput.value = this.formatNumber(e.target.value);
                        textInput.dispatchEvent(new Event('change')); // Trigger app update
                    });

                    textInput.addEventListener('change', (e) => {
                        let parsed = this.parseNumber(e.target.value);
                        // clamp to slider min/max
                        let min = parseFloat(sliderInput.min);
                        let max = parseFloat(sliderInput.max);
                        if (parsed < min) parsed = min;
                        if (parsed > max) parsed = max;

                        sliderInput.value = parsed;
                        textInput.value = this.formatNumber(parsed);
                    });

                    // Optional: format on blur to ensure it always looks nice
                    textInput.addEventListener('blur', (e) => {
                        textInput.value = this.formatNumber(this.parseNumber(e.target.value));
                    });
                }
            });
        },

        bindInputs: function() {
            uiFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', () => {
                        this.updateState();
                        this.runSimulation();
                    });
                    el.addEventListener('change', () => {
                        this.updateState();
                        this.runSimulation();
                    });
                }
            });
        },
        updateState: function() {
            uiFields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') {
                        this.state[id] = el.checked;
                    } else if (el.tagName.toLowerCase() === 'select') {
                        this.state[id] = el.value;
                    } else {
                        // All other inputs (text, range) handle numbers
                        this.state[id] = this.parseNumber(el.value);
                    }
                }
            });
            console.log("State updated:", this.state);
        },
        // Outline of the core simulation

        // Logic for FERS & SS

    calculateFERS: function(s) {
        let sepAge = s.targetAge;
        let yearsOfServiceAtSep = s.yearsOfService + (sepAge > s.currentAge ? sepAge - s.currentAge : 0);
        let high3 = s.high3Salary;
        let startAge = sepAge; // default
        let isImmediate = false;
        let isPostponed = false;
        let isDeferred = false;
        let isVERA = s.veraEligible;

        let mra = 57; // Default MRA
        let multiplier = 0.01;
        let penalty = 0;
        let getsSupplement = false;
        let hasFEHB = true;

        // 1. Determine Gate
        if (isVERA && ((sepAge >= 50 && yearsOfServiceAtSep >= 20) || yearsOfServiceAtSep >= 25)) {
            // VERA
            isImmediate = true;
            getsSupplement = true; // supplement starts at MRA
        } else if (sepAge >= mra && yearsOfServiceAtSep >= 30) {
            isImmediate = true;
            getsSupplement = true;
        } else if (sepAge >= 60 && yearsOfServiceAtSep >= 20) {
            isImmediate = true;
            getsSupplement = true;
        } else if (sepAge >= 62 && yearsOfServiceAtSep >= 5) {
            isImmediate = true;
            multiplier = yearsOfServiceAtSep >= 20 ? 0.011 : 0.01;
            getsSupplement = false;
        } else if (sepAge >= mra && yearsOfServiceAtSep >= 10) {
            // MRA + 10
            if (s.fersMraPreference === 'immediate') {
                isImmediate = true;
                penalty = 0.05 * (62 - sepAge); // 5% per year under 62
            } else {
                isPostponed = true;
                hasFEHB = true; // suspended until start, handled in loop
                startAge = yearsOfServiceAtSep >= 20 ? 60 : 62;
            }
        } else if (sepAge < mra && yearsOfServiceAtSep >= 5) {
            // Deferred
            isDeferred = true;
            hasFEHB = false; // permanent loss
            getsSupplement = false;
            if (yearsOfServiceAtSep >= 30) {
                startAge = mra;
            } else if (yearsOfServiceAtSep >= 20) {
                startAge = 60;
            } else if (yearsOfServiceAtSep >= 10) {
                startAge = mra;
                penalty = 0.05 * (62 - mra);
            } else {
                startAge = 62;
            }
        } else {
            // No pension
            startAge = 999;
            hasFEHB = false;
        }

        let basePension = high3 * yearsOfServiceAtSep * multiplier * (1 - penalty);
        return {
            sepAge: sepAge,
            startAge: startAge,
            yearsOfServiceAtSep: yearsOfServiceAtSep,
            basePension: basePension,
            isImmediate: isImmediate,
            isPostponed: isPostponed,
            isDeferred: isDeferred,
            isVERA: isVERA,
            getsSupplement: getsSupplement,
            hasFEHBPotential: hasFEHB,
            mra: mra
        };
    },

    calculateSS: function(s) {
        // Build 35 year curve
        let currentYearIndex = s.yearsOfService;
        let startSal = s.startingSalary;
        let currSal = s.high3Salary;

        let pastGrowthRate = 0;
        if (currentYearIndex > 1 && currSal > startSal) {
            pastGrowthRate = Math.pow(currSal / startSal, 1 / (currentYearIndex - 1)) - 1;
        }

        let salaries = [];
        // Past
        for (let i = 0; i < currentYearIndex; i++) {
            salaries.push(startSal * Math.pow(1 + pastGrowthRate, i));
        }

        // Future
        let futureYears = Math.max(0, s.targetAge - s.currentAge);
        let futureGrowthRate = 0.025; // 2.5%
        for (let i = 1; i <= futureYears; i++) {
            salaries.push(currSal * Math.pow(1 + futureGrowthRate, i));
        }

        // Fill to 35 with 0s
        while (salaries.length < 35) {
            salaries.push(0);
        }

        // Sort descending, take top 35
        salaries.sort((a,b) => b - a);
        let top35 = salaries.slice(0, 35);
        let total = top35.reduce((a,b) => a+b, 0);
        let aime = total / (35 * 12);

        // 2024 Bend points: $1174, $7078
        let bp1 = 1174;
        let bp2 = 7078;
        let pia = 0;

        if (aime <= bp1) {
            pia = 0.9 * aime;
        } else if (aime <= bp2) {
            pia = (0.9 * bp1) + 0.32 * (aime - bp1);
        } else {
            pia = (0.9 * bp1) + 0.32 * (bp2 - bp1) + 0.15 * (aime - bp2);
        }

        let fraAmountAnnual = pia * 12;

        // Adjust for start age
        let ssAge = s.ssStartAge;
        let fra = 67; // simplified FRA
        let mult = 1.0;

        if (ssAge < fra) {
            let monthsEarly = (fra - ssAge) * 12;
            if (monthsEarly <= 36) {
                mult -= (monthsEarly * (5/9) / 100);
            } else {
                mult -= (36 * (5/9) / 100) + ((monthsEarly - 36) * (5/12) / 100);
            }
        } else if (ssAge > fra) {
            let monthsLate = (ssAge - fra) * 12;
            mult += (monthsLate * (8/12) / 100); // 8% per year
        }

        return {
            fraAmountAnnual: fraAmountAnnual,
            adjustedAmountAnnual: fraAmountAnnual * mult
        };
    },

        // Logic for Taxes and Withdrawals

    calculateTaxes: function(grossIncome, filingStatus, stateCode) {
        // Federal Brackets (2024 Approx)
        let fedStandardDeduction = 0;
        let brackets = [];
        if (filingStatus === 'MFJ') {
            fedStandardDeduction = 29200;
            brackets = [
                { limit: 23200, rate: 0.10 },
                { limit: 94300, rate: 0.12 },
                { limit: 201050, rate: 0.22 },
                { limit: 383900, rate: 0.24 },
                { limit: 487450, rate: 0.32 },
                { limit: 731200, rate: 0.35 },
                { limit: Infinity, rate: 0.37 }
            ];
        } else {
            // Simplify other statuses to Single for now to keep code concise
            fedStandardDeduction = 14600;
            brackets = [
                { limit: 11600, rate: 0.10 },
                { limit: 47150, rate: 0.12 },
                { limit: 100525, rate: 0.22 },
                { limit: 191950, rate: 0.24 },
                { limit: 243725, rate: 0.32 },
                { limit: 609350, rate: 0.35 },
                { limit: Infinity, rate: 0.37 }
            ];
        }

        let taxableFedIncome = Math.max(0, grossIncome - fedStandardDeduction);
        let fedTax = 0;
        let prevLimit = 0;
        for (let b of brackets) {
            if (taxableFedIncome > prevLimit) {
                let amountInBracket = Math.min(taxableFedIncome - prevLimit, b.limit - prevLimit);
                fedTax += amountInBracket * b.rate;
                prevLimit = b.limit;
            } else {
                break;
            }
        }

        // State Taxes (Simplified flat or average progressive approximation)
        let stateTax = 0;
        if (stateCode === 'VA') stateTax = grossIncome * 0.0575; // VA top rate
        else if (stateCode === 'CA') stateTax = grossIncome * 0.093; // CA mid rate
        else if (stateCode === 'CO') stateTax = grossIncome * 0.044; // CO flat rate
        else if (stateCode === 'HI') stateTax = grossIncome * 0.08; // HI mid rate
        else if (stateCode === 'OR') stateTax = grossIncome * 0.0875; // OR mid rate
        else if (stateCode === 'WA') stateTax = 0; // WA 0%
        else stateTax = 0; // Other

        return fedTax + stateTax;
    },

    calculateLTCG: function(gains, filingStatus, ordinaryIncome) {
        let threshold0 = filingStatus === 'MFJ' ? 94050 : 47025;
        let threshold15 = filingStatus === 'MFJ' ? 583750 : 518900;

        let ltcgTax = 0;
        let remainingGains = gains;
        let incomeSpace0 = Math.max(0, threshold0 - ordinaryIncome);

        if (incomeSpace0 > 0) {
            let gainsAt0 = Math.min(remainingGains, incomeSpace0);
            remainingGains -= gainsAt0;
            // 0% tax on this portion
        }

        let incomeSpace15 = Math.max(0, threshold15 - Math.max(ordinaryIncome, threshold0));
        if (incomeSpace15 > 0 && remainingGains > 0) {
            let gainsAt15 = Math.min(remainingGains, incomeSpace15);
            ltcgTax += gainsAt15 * 0.15;
            remainingGains -= gainsAt15;
        }

        if (remainingGains > 0) {
            ltcgTax += remainingGains * 0.20;
        }

        return ltcgTax;
    },

    // Helper to process withdrawals recursively to gross up
    withdrawFromAccount: function(amtNeeded, accountBal, isTaxable, isPenalty, isLTCG, costBasis, filingStatus, stateCode, ordinaryIncome) {
        if (amtNeeded <= 0 || accountBal <= 0) return { drawn: 0, tax: 0, penalty: 0, newBal: accountBal, newBasis: costBasis };

        // Naive binary search to find gross withdrawal needed to net 'amtNeeded'
        let low = amtNeeded;
        let high = Math.min(accountBal, amtNeeded * 2); // safety cap
        let bestGross = amtNeeded;
        let finalTax = 0;
        let finalPenalty = 0;

        if (!isTaxable && !isPenalty && !isLTCG) {
            // Roth / HYSA
            let drawn = Math.min(amtNeeded, accountBal);
            return { drawn: drawn, tax: 0, penalty: 0, newBal: accountBal - drawn, newBasis: costBasis, net: drawn };
        }

        for (let i = 0; i < 15; i++) {
            let midGross = (low + high) / 2;
            let tax = 0;
            let pen = 0;

            if (isTaxable) {
                // Approximate marginal tax on this chunk.
                let newIncome = ordinaryIncome + midGross;
                let taxTotal = this.calculateTaxes(newIncome, filingStatus, stateCode);
                let baseTax = this.calculateTaxes(ordinaryIncome, filingStatus, stateCode);
                tax = taxTotal - baseTax;
            }
            if (isPenalty) {
                pen = midGross * 0.10;
            }
            if (isLTCG) {
                let ratio = costBasis > 0 ? costBasis / accountBal : 0;
                let basisPortion = midGross * ratio;
                let gainsPortion = midGross - basisPortion;
                tax = this.calculateLTCG(gainsPortion, filingStatus, ordinaryIncome);
            }

            let net = midGross - tax - pen;

            if (net < amtNeeded) {
                low = midGross;
            } else {
                high = midGross;
                bestGross = midGross;
                finalTax = tax;
                finalPenalty = pen;
            }
        }

        let drawn = Math.min(bestGross, accountBal);

        // Recalculate if we hit the cap
        if (drawn === accountBal) {
            finalTax = 0;
            finalPenalty = 0;
            if (isTaxable) finalTax = this.calculateTaxes(ordinaryIncome + drawn, filingStatus, stateCode) - this.calculateTaxes(ordinaryIncome, filingStatus, stateCode);
            if (isPenalty) finalPenalty = drawn * 0.10;
            if (isLTCG) {
                let ratio = costBasis > 0 ? costBasis / accountBal : 0;
                let gainsPortion = drawn * (1 - ratio);
                finalTax = this.calculateLTCG(gainsPortion, filingStatus, ordinaryIncome);
            }
        }

        let newBasis = costBasis;
        if (isLTCG) {
            let ratio = costBasis > 0 ? costBasis / accountBal : 0;
            newBasis = Math.max(0, costBasis - (drawn * ratio));
        }

        let actualNet = drawn - finalTax - finalPenalty;
        return { drawn: drawn, tax: finalTax, penalty: finalPenalty, newBal: accountBal - drawn, newBasis: newBasis, net: actualNet, gross: drawn };
    },


        runSimulation: function() {
            console.log("Running simulation...");
            let s = this.state;
            let currentAge = s.currentAge;
            let targetAge = s.targetAge;

            let fers = this.calculateFERS(s);
            let ss = this.calculateSS(s);

            let balances = {
                tradTsp: s.tradTspBalance,
                rothTsp: s.rothTspBalance,
                tradIra: s.tradIraBalance,
                rothIra: s.rothIraBalance,
                taxable: s.taxableBalance,
                hysa: s.hysaBalance
            };

            let taxableCostBasis = s.taxableCostBasis;
            let history = [];
            let annualExpenses = s.annualExpenses;

            let ssActive = false;
            let pensionActive = false;
            let supplementActive = false;

            let depletionAge = null;

            for (let age = currentAge; age <= 100; age++) {
                let isRetired = age >= targetAge;

                // Income this year
                let ordinaryIncome = 0;
                let cashInflow = 0;

                if (isRetired) {
                    // Check FERS Pension
                    if (age >= fers.startAge) pensionActive = true;
                    if (pensionActive) {
                        let pensionAmt = fers.basePension;
                        // Apply COLA (simplified 2%) if over 62
                        if (age >= 62) pensionAmt *= Math.pow(1.02, age - 62);
                        ordinaryIncome += pensionAmt;
                        cashInflow += pensionAmt;
                    }

                    // Check Supplement
                    if (fers.getsSupplement && age >= Math.max(fers.startAge, fers.mra) && age < 62) {
                        supplementActive = true;
                        let suppAmt = (ss.fraAmountAnnual * 0.70) * (fers.yearsOfServiceAtSep / 40);
                        ordinaryIncome += suppAmt;
                        cashInflow += suppAmt;
                    } else {
                        supplementActive = false;
                    }

                    // Check SS
                    if (age >= s.ssStartAge) ssActive = true;
                    if (ssActive) {
                        let ssAmt = ss.adjustedAmountAnnual;
                        if (age > s.ssStartAge) ssAmt *= Math.pow(1.02, age - s.ssStartAge); // SS COLA
                        // 85% of SS is taxable approx
                        ordinaryIncome += ssAmt * 0.85;
                        cashInflow += ssAmt;
                    }
                }

                // Healthcare additions
                let currentExp = annualExpenses;
                if (isRetired) {
                    if (age < 65) {
                        if (fers.hasFEHBPotential && pensionActive) {
                            currentExp += s.fehbPremium;
                        } else {
                            currentExp += s.acaPremium; // lost FEHB or postponed gap
                        }
                    } else {
                        // Medicare age, assume FEHB continues if eligible, or base expenses cover it
                        if (fers.hasFEHBPotential) currentExp += s.fehbPremium;
                    }
                }

                // Tax on fixed income
                let fixedIncomeTax = this.calculateTaxes(ordinaryIncome, s.taxFilingStatus, s.stateOfResidence);
                let netCashInflow = cashInflow - fixedIncomeTax;

                let shortfall = 0;
                if (isRetired) {
                    shortfall = Math.max(0, currentExp - netCashInflow);
                }

                // Withdrawals if retired
                let withdrawn = 0;
                if (isRetired && shortfall > 0) {
                    // Order: HYSA -> Taxable -> Trad -> Roth
                    let order = [
                        { key: 'hysa', isTax: false, isPen: false, isLTCG: false },
                        { key: 'taxable', isTax: false, isPen: false, isLTCG: true },
                        { key: 'tradTsp', isTax: true, isPen: age < 59.5, isLTCG: false },
                        { key: 'tradIra', isTax: true, isPen: age < 59.5, isLTCG: false },
                        { key: 'rothTsp', isTax: false, isPen: false, isLTCG: false }, // simplification on Roth penalty
                        { key: 'rothIra', isTax: false, isPen: false, isLTCG: false }
                    ];

                    for (let acc of order) {
                        if (shortfall <= 0) break;
                        if (balances[acc.key] <= 0) continue;

                        let res = this.withdrawFromAccount(
                            shortfall, balances[acc.key], acc.isTax, acc.isPen, acc.isLTCG,
                            acc.key === 'taxable' ? taxableCostBasis : 0,
                            s.taxFilingStatus, s.stateOfResidence, ordinaryIncome
                        );

                        balances[acc.key] = res.newBal;
                        if (acc.key === 'taxable') taxableCostBasis = res.newBasis;
                        if (acc.isTax) ordinaryIncome += res.gross; // update for next bracket

                        shortfall -= res.net;
                        withdrawn += res.drawn;
                    }

                    if (shortfall > 1 && depletionAge === null) {
                        depletionAge = age;
                    }
                }

                let totalNw = Object.values(balances).reduce((a, b) => a + b, 0);

                history.push({
                    age: age,
                    balances: { ...balances },
                    totalNetWorth: totalNw,
                    expenses: currentExp,
                    isRetired: isRetired,
                    shortfall: shortfall,
                    ordinaryIncome: ordinaryIncome,
                    pensionActive: pensionActive,
                    ssActive: ssActive,
                    supplementActive: supplementActive
                });

                // Inflate expenses for NEXT year
                annualExpenses *= (1 + s.inflationRate / 100);

                // Contributions & Growth for next year
                if (!isRetired) {
                    balances.tradTsp += s.tradTspContrib;
                    balances.rothTsp += s.rothTspContrib;
                    balances.tradIra += s.tradIraContrib;
                    balances.rothIra += s.rothIraContrib;
                    balances.taxable += s.taxableContrib;
                    balances.hysa += s.hysaContrib;
                    taxableCostBasis += s.taxableContrib;
                }

                let marketMult = 1 + s.marketReturn / 100;
                let cashMult = 1 + s.cashYield / 100;

                balances.tradTsp *= marketMult;
                balances.rothTsp *= marketMult;
                balances.tradIra *= marketMult;
                balances.rothIra *= marketMult;
                balances.taxable *= marketMult;
                balances.hysa *= cashMult;
            }

            this.history = history;
            this.fersData = fers;
            this.depletionAge = depletionAge;
            console.log("Simulation finished.", history);
            this.renderChart();
        },

        // Logic for Rendering Chart

        renderChart: function() {
            if (!this.history || this.history.length === 0) return;

            let ages = this.history.map(h => h.age);
            let seriesData = [
                { name: 'Traditional TSP', data: this.history.map(h => h.balances.tradTsp), color: '#1e40af' },
                { name: 'Traditional IRA', data: this.history.map(h => h.balances.tradIra), color: '#3b82f6' },
                { name: 'Roth TSP', data: this.history.map(h => h.balances.rothTsp), color: '#10b981' },
                { name: 'Roth IRA', data: this.history.map(h => h.balances.rothIra), color: '#34d399' },
                { name: 'Taxable Brokerage', data: this.history.map(h => h.balances.taxable), color: '#8b5cf6' },
                { name: 'HYSA / Cash', data: this.history.map(h => h.balances.hysa), color: '#f59e0b' }
            ];

            let s = this.state;
            let f = this.fersData;

            let plotLines = [];

            plotLines.push({ value: s.targetAge, color: '#ef4444', dashStyle: 'dash', width: 2, zIndex: 5,
                label: { text: 'Retirement Age', rotation: 270, y: 15, x: -5, style: { color: '#ef4444', fontWeight: 'bold' } }
            });

            if (f.mra > s.targetAge) {
                plotLines.push({ value: f.mra, color: '#6b7280', dashStyle: 'dot', width: 2, zIndex: 4,
                    label: { text: 'MRA (' + f.mra + ')', rotation: 270, y: 15, x: -5, style: { color: '#6b7280' } }
                });
            }

            plotLines.push({ value: 59.5, color: '#10b981', dashStyle: 'dash', width: 2, zIndex: 4,
                label: { text: 'Penalty Free (59.5)', rotation: 270, y: 15, x: -5, style: { color: '#10b981' } }
            });

            if (f.startAge <= 100) {
                plotLines.push({ value: f.startAge, color: '#8b5cf6', dashStyle: 'dash', width: 2, zIndex: 5,
                    label: { text: 'Pension Starts', rotation: 270, y: 15, x: 10, style: { color: '#8b5cf6', fontWeight: 'bold' } }
                });
            }

            plotLines.push({ value: s.ssStartAge, color: '#3b82f6', dashStyle: 'dash', width: 2, zIndex: 5,
                label: { text: 'Social Security', rotation: 270, y: 15, x: 10, style: { color: '#3b82f6', fontWeight: 'bold' } }
            });

            // Apply Highcharts Dark Theme Settings globally
            Highcharts.setOptions({
                colors: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#a855f7'],
                chart: {
                    backgroundColor: 'transparent',
                    style: { fontFamily: 'Inter, sans-serif' }
                },
                title: { style: { color: '#f8fafc' } },
                xAxis: {
                    gridLineColor: '#334155',
                    labels: { style: { color: '#94a3b8' } },
                    lineColor: '#334155',
                    tickColor: '#334155',
                    title: { style: { color: '#cbd5e1' } }
                },
                yAxis: {
                    gridLineColor: '#334155',
                    labels: { style: { color: '#94a3b8' } },
                    lineColor: '#334155',
                    tickColor: '#334155',
                    title: { style: { color: '#cbd5e1' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    style: { color: '#f8fafc' },
                    borderColor: '#334155'
                },
                legend: {
                    itemStyle: { color: '#cbd5e1' },
                    itemHoverStyle: { color: '#f8fafc' }
                }
            });

            Highcharts.chart('chart-container', {
                chart: { type: 'area', backgroundColor: 'transparent' },
                title: { text: 'Portfolio Longevity Projection' },
                xAxis: { categories: ages, tickInterval: 5, title: { text: 'Age' }, plotLines: plotLines },
                yAxis: {
                    title: { text: 'Balance ($)' },
                    labels: { formatter: function() { return '$' + (this.value / 1000000).toFixed(1) + 'M'; } }
                },
                tooltip: { shared: true, valuePrefix: '$', valueDecimals: 0 },
                plotOptions: { area: { stacking: 'normal', lineColor: '#ffffff', lineWidth: 1, marker: { enabled: false } } },
                series: seriesData,
                credits: { enabled: false }
            });

            let finalNw = this.history[this.history.length - 1].totalNetWorth;
            document.getElementById('summary-networth').innerText = "$" + Math.round(finalNw).toLocaleString();

            let depletionStr = this.depletionAge ? "Age " + this.depletionAge : "Never (Survives to 100+)";
            let depletionEl = document.getElementById('summary-depletion');
            depletionEl.innerText = depletionStr;
            if (this.depletionAge) {
                depletionEl.className = "text-2xl font-bold text-red-400";
            } else {
                depletionEl.className = "text-2xl font-bold text-blue-300";
            }

            let pensionStr = f.startAge <= 100 ? "Age " + f.startAge : "None";
            if (f.startAge <= 100) {
                let pensionAmt = Math.round(f.basePension).toLocaleString();
                pensionStr += " ($" + pensionAmt + "/yr)";
            }
            document.getElementById('summary-pension-start').innerText = pensionStr;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
