// Global State
let predictionData = [];
let featureData = [];

document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);

    document.getElementById('processBtn').addEventListener('click', handleUpload);
});

function log(msg) {
    const logEl = document.getElementById('statusLog');
    const p = document.createElement('p');
    p.innerText = `> ${msg}`;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
}

function updateTime() {
    const now = new Date();
    document.getElementById('dateDisplay').innerText = 
        `TIME: ${now.toISOString().split('T')[0]} ${now.toLocaleTimeString()}`;
}

function handleUpload() {
    const predFile = document.getElementById('predFile').files[0];
    const featFile = document.getElementById('featFile').files[0];

    if (!predFile) {
        log('ERROR: Prediction file is required.');
        alert('Please upload wave_predictions_no_leakage.csv');
        return;
    }

    log('Reading Prediction CSV...');
    Papa.parse(predFile, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            predictionData = results.data;
            log(`Loaded ${predictionData.length} rows.`);
            
            // Check if feature file exists
            if(featFile) {
                log('Reading Feature CSV...');
                Papa.parse(featFile, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    complete: function(fResults) {
                        featureData = fResults.data;
                        initDashboard();
                    }
                });
            } else {
                initDashboard();
            }
        }
    });
}

function initDashboard() {
    log('Initializing Visualization Engine...');
    calculateKPIs();
    renderMainForecast();
    renderResiduals();
    renderActVsPred();
    renderWidth();
    renderCoverage();
    renderQQPlot();
    renderCumError();
    
    if(featureData.length > 0) renderFeatures();
    
    log('Dashboard Active.');
}

// ===============================================
// KPI CALCULATIONS
// ===============================================
function calculateKPIs() {
    // Extract arrays
    const y_true = predictionData.map(d => d.y_true);
    const y_pred = predictionData.map(d => d.q50);
    const q10 = predictionData.map(d => d.q10);
    const q90 = predictionData.map(d => d.q90);

    // MAE
    const mae = y_true.reduce((sum, val, i) => sum + Math.abs(val - y_pred[i]), 0) / y_true.length;
    document.getElementById('kpi-mae').innerText = mae.toFixed(5);

    // R2 (Simplified)
    const meanY = y_true.reduce((a,b)=>a+b,0) / y_true.length;
    const ssTot = y_true.reduce((a,b)=>a+Math.pow(b-meanY, 2), 0);
    const ssRes = y_true.reduce((a,b,i)=>a+Math.pow(b-y_pred[i], 2), 0);
    const r2 = 1 - (ssRes/ssTot);
    document.getElementById('kpi-r2').innerText = r2.toFixed(4);

    // PICP
    let covered = 0;
    y_true.forEach((val, i) => {
        if (val >= q10[i] && val <= q90[i]) covered++;
    });
    const picp = covered / y_true.length;
    document.getElementById('kpi-picp').innerText = (picp * 100).toFixed(1) + '%';

    // Last Prediction
    const last = y_pred[y_pred.length - 1];
    document.getElementById('kpi-last').innerText = last.toFixed(5);
}

// ===============================================
// PLOTLY CONFIG (DARK THEME)
// ===============================================
const layoutCommon = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#e0e0e0', family: 'Inter' },
    margin: { t: 30, b: 40, l: 50, r: 20 },
    xaxis: { gridcolor: '#333' },
    yaxis: { gridcolor: '#333' },
    showlegend: true,
    legend: { x: 0, y: 1.1, orientation: 'h' }
};

// ===============================================
// CHARTS
// ===============================================

function renderMainForecast() {
    // Limit to last 500 points for performance if dataset is huge
    const subset = predictionData.slice(-500); 
    
    const traceTrue = {
        x: subset.map(d => d.Date),
        y: subset.map(d => d.y_true),
        type: 'scatter',
        mode: 'lines',
        name: 'Actual',
        line: { color: '#ffffff', width: 1 }
    };

    const tracePred = {
        x: subset.map(d => d.Date),
        y: subset.map(d => d.q50),
        type: 'scatter',
        mode: 'lines',
        name: 'Forecast',
        line: { color: '#00bcd4', width: 2 }
    };

    const traceUpper = {
        x: subset.map(d => d.Date),
        y: subset.map(d => d.q90),
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        marker: {color: "444"},
        showlegend: false,
        hoverinfo:'skip'
    };

    const traceLower = {
        x: subset.map(d => d.Date),
        y: subset.map(d => d.q10),
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 188, 212, 0.2)',
        line: { width: 0 },
        name: '80% Interval'
    };

    Plotly.newPlot('mainForecastChart', [traceUpper, traceLower, traceTrue, tracePred], {
        ...layoutCommon,
        title: false
    }, {responsive: true});
}

function renderResiduals() {
    const residuals = predictionData.map(d => d.y_true - d.q50);
    
    const trace = {
        x: residuals,
        type: 'histogram',
        marker: { color: '#ff9800' },
        opacity: 0.7
    };

    Plotly.newPlot('residualDistChart', [trace], {
        ...layoutCommon,
        bargap: 0.05
    }, {responsive: true});
}

function renderActVsPred() {
    const trace = {
        x: predictionData.map(d => d.y_true),
        y: predictionData.map(d => d.q50),
        mode: 'markers',
        type: 'scatter',
        marker: { color: '#00bcd4', size: 3, opacity: 0.5 }
    };

    const minVal = Math.min(...trace.x);
    const maxVal = Math.max(...trace.x);

    const line = {
        x: [minVal, maxVal],
        y: [minVal, maxVal],
        mode: 'lines',
        line: { color: '#f44336', dash: 'dash' },
        name: 'Perfect'
    };

    Plotly.newPlot('actVsPredChart', [trace, line], {
        ...layoutCommon,
        xaxis: { title: 'Actual', gridcolor: '#333' },
        yaxis: { title: 'Predicted', gridcolor: '#333' }
    }, {responsive: true});
}

function renderWidth() {
    const width = predictionData.map(d => d.q90 - d.q10);
    const trace = {
        y: width,
        type: 'box',
        marker: { color: '#9c27b0' },
        name: 'Interval Width'
    };
    
    Plotly.newPlot('widthChart', [trace], {
        ...layoutCommon
    }, {responsive: true});
}

function renderCoverage() {
    // Calculate rolling mean of boolean coverage
    const windowSize = 168; // 1 week
    const isCovered = predictionData.map(d => (d.y_true >= d.q10 && d.y_true <= d.q90) ? 1 : 0);
    
    let rolling = [];
    for(let i = windowSize; i < isCovered.length; i++) {
        let sum = 0;
        for(let j = 0; j < windowSize; j++) sum += isCovered[i-j];
        rolling.push(sum / windowSize);
    }

    const trace = {
        x: predictionData.slice(windowSize).map(d => d.Date),
        y: rolling,
        mode: 'lines',
        line: { color: '#4caf50' },
        name: 'Rolling Coverage'
    };

    const targetLine = {
        x: [predictionData[windowSize].Date, predictionData[predictionData.length-1].Date],
        y: [0.8, 0.8],
        mode: 'lines',
        line: { color: '#f44336', dash: 'dash' },
        name: 'Target (0.8)'
    };

    Plotly.newPlot('coverageChart', [trace, targetLine], {
        ...layoutCommon,
        yaxis: { range: [0, 1], gridcolor: '#333' }
    }, {responsive: true});
}

function renderFeatures() {
    const top20 = featureData.slice(0, 20).reverse(); // Reverse for horiz bar chart
    
    const trace = {
        x: top20.map(d => d.Importance),
        y: top20.map(d => d.Feature),
        type: 'bar',
        orientation: 'h',
        marker: {
            color: top20.map((v, i) => i === 19 ? '#ff9800' : '#444') // Highlight top
        }
    };

    Plotly.newPlot('featureChart', [trace], {
        ...layoutCommon,
        margin: { l: 150, t: 20, b: 30, r: 20 }
    }, {responsive: true});
}

function renderQQPlot() {
    // Simple theoretical Normal vs Sample quantiles logic
    const residuals = predictionData.map(d => d.y_true - d.q50).sort((a,b) => a-b);
    const n = residuals.length;
    
    // Generate theoretical quantiles (Standard Normal)
    const theoretical = [];
    for(let i=0; i<n; i++) {
        const p = (i + 0.5) / n;
        // Inverse error function approx for normal quantile
        theoretical.push(Math.sqrt(2) * erfinv(2 * p - 1)); 
    }
    
    // Scale residuals to mean 0 std 1 for comparison
    const mean = residuals.reduce((a,b)=>a+b,0)/n;
    const std = Math.sqrt(residuals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(n-1));
    const scaledRes = residuals.map(x => (x-mean)/std);

    const trace = {
        x: theoretical,
        y: scaledRes,
        mode: 'markers',
        type: 'scatter',
        marker: { size: 3, color: '#ffeb3b' }
    };

    const line = {
        x: [-3, 3], y: [-3, 3],
        mode: 'lines', line: { color: '#f44336' }
    };

    Plotly.newPlot('qqChart', [trace, line], {
        ...layoutCommon,
        xaxis: { title: 'Theoretical Quantiles', gridcolor: '#333' },
        yaxis: { title: 'Standardized Residuals', gridcolor: '#333' }
    }, {responsive: true});
}

function renderCumError() {
    let cumError = 0;
    const errors = predictionData.map(d => {
        cumError += Math.abs(d.y_true - d.q50);
        return cumError;
    });

    const trace = {
        x: predictionData.map(d => d.Date),
        y: errors,
        mode: 'lines',
        fill: 'tozeroy',
        line: { color: '#e91e63' },
        name: 'Cumulative AE'
    };

    Plotly.newPlot('cumErrorChart', [trace], {
        ...layoutCommon
    }, {responsive: true});
}

// Math helper for Q-Q plot
function erfinv(x){
    var z;
    var a = 0.147;                                                   
    var the_sign_of_x;
    if(0==x) {
        the_sign_of_x = 0;
    } else if(x>0){
        the_sign_of_x = 1;
    } else {
        the_sign_of_x = -1;
    }
    var 1_minus_x_squared = 1 - x*x;
    var ln_1_minus_x_squared = Math.log(1_minus_x_squared);
    var pi_times_a = Math.PI * a;
    var term1 = (2/(pi_times_a) + (ln_1_minus_x_squared/2));
    var term2 = (ln_1_minus_x_squared/a);
    var term3 = (2/(pi_times_a) + (ln_1_minus_x_squared/2));
    z = Math.sqrt(Math.sqrt((term1*term1) - term2) - term3);
    return z * the_sign_of_x;
}
