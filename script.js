// Global data storage
let predictionData = [];
let featureData = [];

// Drag and Drop Logic
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFiles);

function handleDrop(e) {
    dropZone.classList.remove('dragover');
    const dt = e.dataTransfer;
    const files = dt.files;
    processFiles(files);
}

function handleFiles(e) {
    const files = this.files;
    processFiles(files);
}

function processFiles(files) {
    let filesProcessed = 0;
    const totalFiles = files.length;

    [...files].forEach(file => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (file.name.includes('prediction')) {
                    predictionData = results.data;
                } else if (file.name.includes('feature')) {
                    featureData = results.data;
                }
                
                filesProcessed++;
                if (filesProcessed === totalFiles) {
                    initDashboard();
                }
            }
        });
    });
}

function initDashboard() {
    if (predictionData.length === 0) {
        alert("Please upload the prediction CSV file.");
        return;
    }

    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';

    calculateMetrics();
    renderMainChart();
    renderResiduals();
    if (featureData.length > 0) renderFeatureImportance();
}

// ---------------------------
// Math & Rendering Functions
// ---------------------------

function calculateMetrics() {
    const y_true = predictionData.map(d => d.y_true);
    const y_pred = predictionData.map(d => d.q50);
    const q10 = predictionData.map(d => d.q10);
    const q90 = predictionData.map(d => d.q90);
    const n = y_true.length;

    // MAE
    const mae = y_true.reduce((acc, val, i) => acc + Math.abs(val - y_pred[i]), 0) / n;
    
    // RMSE
    const rmse = Math.sqrt(y_true.reduce((acc, val, i) => acc + Math.pow(val - y_pred[i], 2), 0) / n);
    
    // R2
    const mean_y = y_true.reduce((a, b) => a + b) / n;
    const ss_tot = y_true.reduce((acc, val) => acc + Math.pow(val - mean_y, 2), 0);
    const ss_res = y_true.reduce((acc, val, i) => acc + Math.pow(val - y_pred[i], 2), 0);
    const r2 = 1 - (ss_res / ss_tot);

    // Coverage
    const covered = y_true.filter((val, i) => val >= q10[i] && val <= q90[i]).length;
    const coverage = covered / n;

    document.getElementById('metric-mae').innerText = mae.toFixed(5);
    document.getElementById('metric-rmse').innerText = rmse.toFixed(5);
    document.getElementById('metric-r2').innerText = r2.toFixed(4);
    document.getElementById('metric-cov').innerText = (coverage * 100).toFixed(1) + '%';
}

function renderMainChart() {
    const dates = predictionData.map(d => d.Date);
    const y_true = predictionData.map(d => d.y_true);
    const q50 = predictionData.map(d => d.q50);
    const q10 = predictionData.map(d => d.q10);
    const q90 = predictionData.map(d => d.q90);

    const traceActual = {
        x: dates, y: y_true,
        mode: 'lines', name: 'Actual Wave',
        line: { color: '#ffffff', width: 1 }
    };

    const tracePred = {
        x: dates, y: q50,
        mode: 'lines', name: 'Forecast',
        line: { color: '#3b82f6', width: 2 }
    };

    const traceUpper = {
        x: dates, y: q90,
        mode: 'lines', name: 'Upper Bound',
        line: { width: 0 }, showlegend: false,
        hoverinfo: 'skip'
    };

    const traceLower = {
        x: dates, y: q10,
        mode: 'lines', name: '80% Confidence',
        fill: 'tonexty', fillcolor: 'rgba(59, 130, 246, 0.2)',
        line: { width: 0 }, showlegend: true,
        hoverinfo: 'skip'
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8' },
        margin: { t: 10, l: 40, r: 10, b: 40 },
        xaxis: { gridcolor: '#334155' },
        yaxis: { gridcolor: '#334155' },
        hovermode: 'x unified'
    };

    Plotly.newPlot('chart-main', [traceUpper, traceLower, traceActual, tracePred], layout);
}

function renderResiduals() {
    const residuals = predictionData.map(d => d.y_true - d.q50);

    const trace = {
        x: residuals,
        type: 'histogram',
        marker: { color: '#ef4444' },
        opacity: 0.7
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8' },
        margin: { t: 10, l: 40, r: 10, b: 40 },
        xaxis: { title: 'Prediction Error', gridcolor: '#334155' },
        yaxis: { gridcolor: '#334155' }
    };

    Plotly.newPlot('chart-residuals', [trace], layout);
}

function renderFeatureImportance() {
    // Sort and take top 15
    const sorted = featureData.sort((a, b) => b.Importance - a.Importance).slice(0, 15);
    
    const trace = {
        y: sorted.map(d => d.Feature),
        x: sorted.map(d => d.Importance),
        type: 'bar',
        orientation: 'h',
        marker: { color: '#10b981' }
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#94a3b8' },
        margin: { t: 10, l: 150, r: 10, b: 40 },
        xaxis: { gridcolor: '#334155' },
        yaxis: { autorange: 'reversed' } // Top feature at top
    };

    Plotly.newPlot('chart-features', [trace], layout);
}