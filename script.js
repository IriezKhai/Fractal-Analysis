// Data Storage
let dfPred = [];    // Predictions (LightGBM)
let dfBase = [];    // Baselines (Ridge, RF, Random Walk)
let dfFeat = [];    // Features
let mergedData = []; // Combined for analysis

// DOM Elements
const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');

// 1. Navigation Logic
function switchPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    
    // Show selected
    document.getElementById(`page-${pageId}`).style.display = 'block';
    
    // Update active nav
    const navItems = document.querySelectorAll('.nav-links li');
    if(pageId === 'overview') navItems[0].classList.add('active');
    if(pageId === 'comparison') navItems[1].classList.add('active');
    if(pageId === 'diagnostics') navItems[2].classList.add('active');
    if(pageId === 'data') navItems[3].classList.add('active');

    // Trigger plot resize (fixes hidden tab rendering issues)
    window.dispatchEvent(new Event('resize'));
}

// 2. File Handling
fileInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    let loadedCount = 0;

    if(files.length === 0) return;

    statusText.innerText = "Parsing files...";

    files.forEach(file => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (file.name.includes('baseline')) dfBase = results.data;
                else if (file.name.includes('feature')) dfFeat = results.data;
                else if (file.name.includes('prediction')) dfPred = results.data;
                
                loadedCount++;
                if (loadedCount === files.length) {
                    processData();
                }
            }
        });
    });
});

function processData() {
    if (dfPred.length === 0) {
        statusText.innerText = "Error: Predictions file missing.";
        return;
    }

    // Merge Preds and Baselines on Date if baselines exist
    if (dfBase.length > 0) {
        // Create a map for fast lookup
        const baseMap = new Map(dfBase.map(i => [i.Date, i]));
        
        mergedData = dfPred.map(row => {
            const baseRow = baseMap.get(row.Date) || {};
            return { ...row, ...baseRow }; // Combine properties
        });
    } else {
        mergedData = dfPred;
    }

    statusText.innerText = "✓ Analysis Ready";
    statusText.style.color = "#10b981";

    updateOverview();
    updateComparison();
    updateDiagnostics();
    updateDataTable();
}

// 3. Page Updates

function updateOverview() {
    const dates = mergedData.map(d => d.Date);
    const y_true = mergedData.map(d => d.y_true);
    const q50 = mergedData.map(d => d.q50);
    const q10 = mergedData.map(d => d.q10);
    const q90 = mergedData.map(d => d.q90);

    // Metrics
    const mae = getMAE(y_true, q50);
    const rmse = getRMSE(y_true, q50);
    const r2 = getR2(y_true, q50);
    
    // Directional Accuracy (Did it predict the sign of change correctly?)
    // Simplified: check if sign(pred) == sign(true) for this Fractal diff target
    const dirAcc = y_true.reduce((acc, val, i) => acc + (Math.sign(val) === Math.sign(q50[i]) ? 1 : 0), 0) / y_true.length;

    document.getElementById('metric-mae').innerText = mae.toFixed(4);
    document.getElementById('metric-rmse').innerText = rmse.toFixed(4);
    document.getElementById('metric-r2').innerText = r2.toFixed(3);
    document.getElementById('metric-dir').innerText = (dirAcc * 100).toFixed(1) + '%';

    // Chart: Main Forecast
    const traceTrue = { x: dates, y: y_true, name: 'Actual', line: {color: 'white', width: 1} };
    const tracePred = { x: dates, y: q50, name: 'LightGBM', line: {color: '#3b82f6', width: 2} };
    const traceUpper = { x: dates, y: q90, line: {width: 0}, showlegend: false, name: 'UB' };
    const traceLower = { x: dates, y: q10, fill: 'tonexty', fillcolor: 'rgba(59, 130, 246, 0.2)', line: {width: 0}, name: '80% PI' };

    Plotly.newPlot('chart-main', [traceUpper, traceLower, traceTrue, tracePred], getLayout('Forecast vs Actual'));

    // Chart: Coverage
    const isCovered = y_true.map((v, i) => (v >= q10[i] && v <= q90[i]) ? 1 : 0);
    // Rolling mean of 168 hours (1 week)
    const rollingCov = movingAverage(isCovered, 168);
    const traceCov = { x: dates, y: rollingCov, line: {color: '#10b981'} };
    
    Plotly.newPlot('chart-coverage', [traceCov], {
        ...getLayout('Rolling Coverage (Target 0.8)'),
        shapes: [{ type: 'line', y0: 0.8, y1: 0.8, x0: dates[0], x1: dates[dates.length-1], line: {color: 'red', dash: 'dot'} }]
    });

    // Chart: Features
    if(dfFeat.length > 0) {
        const sorted = dfFeat.sort((a,b) => b.Importance - a.Importance).slice(0, 15);
        const traceFeat = { 
            y: sorted.map(d => d.Feature), x: sorted.map(d => d.Importance), 
            type: 'bar', orientation: 'h', marker: {color: '#3b82f6'} 
        };
        Plotly.newPlot('chart-features', [traceFeat], {
            ...getLayout('Feature Importance'),
            yaxis: { autorange: 'reversed', gridcolor: '#334155' }
        });
    }
}

function updateComparison() {
    if (dfBase.length === 0) return;

    const models = ['q50', 'Random Walk', 'Historical Mean', 'Ridge Regression', 'Random Forest', 'Last Value'];
    // Filter models that actually exist in the CSV headers
    const validModels = models.filter(m => mergedData[0].hasOwnProperty(m));
    const y_true = mergedData.map(d => d.y_true);
    
    // 1. Leaderboard
    const leaderboard = validModels.map(model => {
        const preds = mergedData.map(d => d[model]);
        const cleanName = model === 'q50' ? 'LightGBM (Ours)' : model;
        return {
            name: cleanName,
            mae: getMAE(y_true, preds),
            rmse: getRMSE(y_true, preds)
        };
    }).sort((a, b) => a.mae - b.mae);

    // Calculate % improvement vs Random Walk (Baseline)
    const rwScore = leaderboard.find(l => l.name === 'Random Walk')?.mae || leaderboard[leaderboard.length-1].mae;
    
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = leaderboard.map((l, i) => `
        <tr>
            <td>${i+1}</td>
            <td style="font-weight: bold; color: ${l.name.includes('LightGBM') ? '#3b82f6' : 'white'}">${l.name}</td>
            <td>${l.mae.toFixed(5)}</td>
            <td>${l.rmse.toFixed(5)}</td>
            <td style="color: ${l.mae < rwScore ? '#10b981' : '#ef4444'}">
                ${((1 - l.mae/rwScore)*100).toFixed(1)}%
            </td>
        </tr>
    `).join('');

    // 2. Cumulative Error Chart
    const traces = validModels.map(model => {
        const preds = mergedData.map(d => d[model]);
        // Cumulative Squared Error
        let sum = 0;
        const cumError = y_true.map((trueVal, i) => {
            sum += Math.pow(trueVal - preds[i], 2);
            return sum;
        });
        
        return {
            x: mergedData.map(d => d.Date),
            y: cumError,
            name: model === 'q50' ? 'LightGBM' : model,
            line: { width: model === 'q50' ? 3 : 1 }
        };
    });

    Plotly.newPlot('chart-cumulative', traces, getLayout('Cumulative Squared Error (Lower is Better)'));
}

function updateDiagnostics() {
    const y_true = mergedData.map(d => d.y_true);
    const y_pred = mergedData.map(d => d.q50);
    const dates = mergedData.map(d => d.Date);

    // Scatter
    const traceScatter = {
        x: y_true, y: y_pred, mode: 'markers', type: 'scatter',
        marker: { color: 'rgba(59, 130, 246, 0.5)', size: 4 }
    };
    const line = { x: [Math.min(...y_true), Math.max(...y_true)], y: [Math.min(...y_true), Math.max(...y_true)], mode: 'lines', line: {color:'red', dash:'dash'} };
    
    Plotly.newPlot('chart-scatter', [traceScatter, line], getLayout('Pred vs Actual'));

    // Residuals
    const residuals = y_true.map((v, i) => v - y_pred[i]);
    const traceRes = { x: residuals, type: 'histogram', marker: {color: '#ef4444'} };
    Plotly.newPlot('chart-residuals', [traceRes], getLayout('Error Distribution'));

    // Rolling MAE (Volatility of Error)
    const absErr = residuals.map(Math.abs);
    const rollingErr = movingAverage(absErr, 24); // 24h rolling error
    
    Plotly.newPlot('chart-rolling-error', [{x: dates, y: rollingErr, line:{color: '#fbbf24'}}], getLayout('Rolling 24h MAE'));
}

function updateDataTable() {
    const table = document.getElementById('raw-data-table');
    // Headers
    const headers = Object.keys(mergedData[0]);
    let html = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    
    // Body (Limit to last 100 rows for performance)
    const rows = mergedData.slice(-100); 
    html += `<tbody>${rows.map(row => `
        <tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>
    `).join('')}</tbody>`;

    table.innerHTML = html;
}

// Helpers
function getMAE(trueVals, predVals) {
    return trueVals.reduce((sum, val, i) => sum + Math.abs(val - predVals[i]), 0) / trueVals.length;
}
function getRMSE(trueVals, predVals) {
    return Math.sqrt(trueVals.reduce((sum, val, i) => sum + Math.pow(val - predVals[i], 2), 0) / trueVals.length);
}
function getR2(trueVals, predVals) {
    const mean = trueVals.reduce((a, b) => a + b) / trueVals.length;
    const ssTot = trueVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    const ssRes = trueVals.reduce((a, b, i) => a + Math.pow(b - predVals[i], 2), 0);
    return 1 - (ssRes / ssTot);
}
function movingAverage(data, window) {
    let result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window) { result.push(null); continue; }
        const slice = data.slice(i - window, i);
        const avg = slice.reduce((a,b) => a+b, 0) / window;
        result.push(avg);
    }
    return result;
}
function getLayout(title) {
    return {
        title: title,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8' },
        margin: { t: 40, l: 40, r: 20, b: 40 },
        xaxis: { gridcolor: '#334155' },
        yaxis: { gridcolor: '#334155' },
        showlegend: true
    };
}
