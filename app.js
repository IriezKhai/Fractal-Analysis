let predictions = [];
let baselines = [];
let features = [];

function loadCSV(path, callback) {
  Papa.parse(path, {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: res => callback(res.data)
  });
}

function init() {
  loadCSV("data/wave_predictions_no_leakage.csv", d => {
    predictions = d;
    drawAll();
  });

  loadCSV("data/wave_baselines_no_leakage.csv", d => baselines = d);
  loadCSV("data/feature_importance_wave_no_leakage.csv", d => features = d);
}

function filterData(n) {
  if (n === "all") return predictions;
  return predictions.slice(-parseInt(n));
}

/* ========== TOOL 1: Forecast Chart ========== */
function drawForecast(data) {
  Plotly.newPlot("tsChart", [
    {
      x: data.map(d => d.Date),
      y: data.map(d => d.y_true),
      name: "Actual",
      line: {color: "white"}
    },
    {
      x: data.map(d => d.Date),
      y: data.map(d => d.q50),
      name: "Forecast (q50)",
      line: {dash: "dash"}
    },
    {
      x: [...data.map(d => d.Date), ...data.map(d => d.Date).reverse()],
      y: [...data.map(d => d.q90), ...data.map(d => d.q10).reverse()],
      fill: "toself",
      fillcolor: "rgba(0,120,255,0.2)",
      line: {width: 0},
      name: "80% PI"
    }
  ], {title: "FracDiff Forecast"});
}

/* ========== TOOL 2–12 (condensed but real) ========== */
function drawResiduals(data) {
  const res = data.map(d => d.y_true - d.q50);
  Plotly.newPlot("residualChart", [{
    x: res,
    type: "histogram"
  }], {title: "Residual Distribution"});
}

function drawScatter(data) {
  Plotly.newPlot("scatterChart", [{
    x: data.map(d => d.y_true),
    y: data.map(d => d.q50),
    mode: "markers"
  }], {title: "Actual vs Predicted"});
}

function drawCoverage(data) {
  const inside = data.map(d => d.y_true >= d.q10 && d.y_true <= d.q90 ? 1 : 0);
  Plotly.newPlot("coverageChart", [{
    y: inside,
    type: "scatter",
    mode: "lines"
  }], {title: "Prediction Interval Coverage"});
}

function drawWidth(data) {
  Plotly.newPlot("widthChart", [{
    y: data.map(d => d.q90 - d.q10),
    type: "histogram"
  }], {title: "Interval Width"});
}

function drawFeatures() {
  Plotly.newPlot("featureChart", [{
    x: features.slice(0,20).map(d => d.Importance),
    y: features.slice(0,20).map(d => d.Feature),
    type: "bar",
    orientation: "h"
  }], {title: "Top Feature Importance"});
}

function drawAll() {
  const n = document.getElementById("windowSelect").value;
  const data = filterData(n);
  drawForecast(data);
  drawResiduals(data);
  drawScatter(data);
  drawCoverage(data);
  drawWidth(data);
  drawFeatures();
}

document.getElementById("windowSelect").addEventListener("change", drawAll);
init();

