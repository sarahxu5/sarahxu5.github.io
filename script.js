document.addEventListener('DOMContentLoaded', init);

async function init() {
    const scenes = ['#scene-1', '#scene-2', '#scene-3'];
    let currentScene = 0;

    // Load CSVs
    const [incomeRaw, populationRaw, regionRaw, covidRaw] = await Promise.all([
        d3.csv("median_family_income.csv", d => ({
            State: d.State,
            Value: +d.Value,
            Rank: +d["Rank within US"]
        })),
        d3.csv("state_population.csv", d => ({
            State: d.State,
            Year: +d.Year,
            Population: +d.Population
        })),
        d3.csv("states_region.csv", d => ({
            State: d.State,
            StateCode: d["State Code"],
            Region: d.Region,
            Division: d.Division
        })),
        d3.csv("us_states.csv", d => ({
            Date: new Date(d.Date),
            State: d.State,
            Cases: +d.Cases,
            Deaths: +d.Deaths
        }))
    ]);

    const incomeByState = {};
    incomeRaw.forEach(d => incomeByState[d.State] = d.Value);

    const populationByStateYear = {};
    populationRaw.forEach(d => {
        if (!populationByStateYear[d.State]) populationByStateYear[d.State] = {};
        populationByStateYear[d.State][d.Year] = d.Population;
    });

    const regionByState = {};
    regionRaw.forEach(d => regionByState[d.State] = d.Region);

    const covidByStateYear = d3.group(covidRaw, d => d.State, d => d.Date.getFullYear());

    // SCENE 1 DATA: Average max deaths per year (2020-2023)
    const years = [2020, 2021, 2022, 2023];
    const avgMaxDeathsByYear = years.map(year => {
        const maxDeathsStates = [];
        covidByStateYear.forEach((yearMap, state) => {
            const dataForYear = yearMap.get(year);
            if (dataForYear) {
                const maxDeaths = d3.max(dataForYear, d => d.Deaths);
                maxDeathsStates.push(maxDeaths);
            }
        });
        return {
            Year: year,
            AvgMaxDeaths: d3.mean(maxDeathsStates)
        };
    });

    // SCENE 2 DATA: Scatter plot (state, income, max cases, region)
    const maxCasesByState = {};
    covidByStateYear.forEach((yearMap, state) => {
        let maxCases = 0;
        years.forEach(y => {
            const dataForYear = yearMap.get(y);
            if (dataForYear) {
                const maxCasesForYear = d3.max(dataForYear, d => d.Cases);
                if (maxCasesForYear > maxCases) maxCases = maxCasesForYear;
            }
        });
        maxCasesByState[state] = maxCases;
    });

    const scatterData = [];
    Object.keys(incomeByState).forEach(state => {
        scatterData.push({
            State: state,
            income: incomeByState[state],
            maxCases: maxCasesByState[state] || 0,
            region: regionByState[state] || "Unknown"
        });
    });

    // REGION COLORS
    const regionColors = {
        "Northeast": "#1f77b4",
        "Midwest": "#ff7f0e",
        "South": "#2ca02c",
        "West": "#d62728",
        "Unknown": "#999999",
    };

    // Populate state dropdown
    const stateSelect = d3.select("#state-select");
    Object.keys(incomeByState).sort().forEach(state => {
        stateSelect.append("option").attr("value", state).text(state);
    });

    // Scene button handlers
    d3.selectAll('.scene-btn').on('click', function() {
        const targetScene = +d3.select(this).attr('data-scene');
        if (currentScene !== targetScene) {
            d3.select(scenes[currentScene]).classed('active', false);
            currentScene = targetScene;
            d3.select(scenes[currentScene]).classed('active', true);
            updateScene();
            updateButtons();
        }
    });
    function updateButtons() {
        d3.selectAll('.scene-btn').classed('active', (d, i, nodes) =>
            +nodes[i].getAttribute('data-scene') === currentScene
        );
    }
    updateButtons();

    stateSelect.on('change', function () {
        const selectedState = this.value;
        if (selectedState) {
            updateScene3(selectedState);
        } else {
            d3.select("#state-line-chart").selectAll("*").remove();
            d3.select("#tooltip").style("display", "none");
        }
    });

    // Initial render
    updateScene();

    function updateScene() {
        if (currentScene === 0) {
            renderScene1(avgMaxDeathsByYear);
        } else if (currentScene === 1) {
            renderScene2(scatterData);
        } else if (currentScene === 2) {
            const selectedState = stateSelect.property('value');
            if (selectedState) {
                updateScene3(selectedState);
            } else {
                d3.select("#state-line-chart").selectAll("*").remove();
                d3.select("#tooltip").style("display", "none");
            }
        }
        updateButtons();
    }

    // ========== SCENE 1: Average Deaths ==========
    function renderScene1(data) {
        d3.select("#line-chart").selectAll("*").remove();
        const svgWidth = 900, svgHeight = 600;
        const margin = { top: 40, right: 40, bottom: 60, left: 70 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;
        const svg = d3.select("#line-chart").append("svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        // Correct: linear scale for years
        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.Year))
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.AvgMaxDeaths) * 1.1])
            .nice()
            .range([height, 0]);
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(data.length).tickFormat(d3.format("d")))
            .selectAll("text")
            .attr("transform", "rotate(-45)").style("text-anchor", "end");
        g.append("g").call(d3.axisLeft(y));
        const line = d3.line()
            .x(d => x(d.Year))
            .y(d => y(d.AvgMaxDeaths));
        g.append("path")
            .datum(data)
            .attr("class", "line")
            .attr("d", line)
            .attr("stroke", "#fe0000")
            .attr("fill", "none"); 
        g.selectAll(".point")
            .data(data).enter().append("circle")
            .attr("class", "point")
            .attr("cx", d => x(d.Year))
            .attr("cy", d => y(d.AvgMaxDeaths))
            .attr("r", 4).attr("fill", "#fe0000");
        svg.append("text") // x-axis label
            .attr("x", margin.left + width / 2)
            .attr("y", svgHeight - 10)
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Year");
        svg.append("text") // y-axis label
            .attr("transform", "rotate(-90)")
            .attr("y", 5) // padding from the left edge
            .attr("x", -(margin.top + height / 2))
            .attr("dy", "1em")
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Average Max Deaths");
        const peak = data.reduce((acc, d) => d.AvgMaxDeaths > acc.AvgMaxDeaths ? d : acc, data[0]);
        const annotationData = [{
            note: {
                label: `Peak Avg Deaths: ${peak.AvgMaxDeaths.toFixed(0)} in ${peak.Year}`,
                align: "middle",
                wrap: 180
            },
            x: x(peak.Year),
            y: y(peak.AvgMaxDeaths),
            dy: -40, dx: -100
        }];
        const makeAnnotation = d3.annotation()
            .annotations(annotationData)
            .type(d3.annotationLabel);
        g.append("g")
            .attr("class", "annotation-group")
            .call(makeAnnotation);
    }

    // ========== SCENE 2: Scatter ==========
    function renderScene2(data) {
        d3.select("#scatter-plot").selectAll("*").remove();
        d3.select("#legend").selectAll("*").remove();
        const svgWidth = 800, svgHeight = 600;
        const margin = { top: 40, right: 150, bottom: 60, left: 70 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;
        const svg = d3.select("#scatter-plot").append("svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleLinear()
            .domain([60000, 130000])
            .nice().range([0, width]);
        const y = d3.scaleLinear()
            .domain([1, 13000000])
            .nice().range([height, 0]);
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format("$.2s")))
            .selectAll("text")
            .attr("transform", "rotate(-45)").style("text-anchor", "end");
        g.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2s")));
        svg.append("text")
            .attr("x", margin.left + width / 2)
            .attr("y", svgHeight - 10)
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Median Family Income ($)");
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 5)
            .attr("x", -(margin.top + height / 2))
            .attr("dy", "1em")
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Max COVID-19 Cases");
        g.selectAll(".dot")
            .data(data)
            .enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => x(d.income))
            .attr("cy", d => y(d.maxCases))
            .attr("r", 5)
            .attr("fill", d => regionColors[d.region] || regionColors["Unknown"])
            .attr("opacity", 0.8)
            .append("title")
        const southData = data.filter(d =>
            d.region === "South" &&
            d.income <= 95000 && // adjust to your low income threshold
            d.maxCases >= 7000000 // adjust for "high" cases as fits your data
        );
        if (southData.length) {
            // Compute centroid
            const avgIncome = d3.mean(southData, d => d.income);
            const avgCases = d3.mean(southData, d => d.maxCases);
    
            const annotationData = [
                {
                    note: {
                        label: "Most lower income but high case states are in the South",
                        align: "right",
                        wrap: 200
                    },
                    x: x(avgIncome),
                    y: y(avgCases),
                    dx: -20, 
                    dy: 90
                },
                {
                    note: { label: "", align: "right"},
                    x: x(80000),
                    y: y(5000000),
                    dx: 30,
                    dy: 90
                  }
            ];
            
            const makeAnnotation = d3.annotation()
                .annotations(annotationData)
                .type(d3.annotationCallout);
            g.append("g")
                .attr("class", "annotation-group south-annotation")
                .call(makeAnnotation);
        }
        // Legend
        const legend = d3.select("#legend");
        Object.entries(regionColors).forEach(([region, color]) => {
            if (region === "Unknown") return;
            const item = legend.append("div").attr("class", "legend-item");
            item.append("div")
                .attr("class", "legend-color-box")
                .style("background-color", color);
            item.append("div").text(region);
        });
    }

    // ========== SCENE 3: STATE DETAIL ==========
    function updateScene3(state) {
        const stateData = covidRaw.filter(d => d.State === state && d.Date.getFullYear() >= 2020 && d.Date.getFullYear() <= 2023);
        const deathTimeSeries = stateData.sort((a,b) => a.Date - b.Date);
        d3.select("#state-line-chart").selectAll("*").remove();
        const tooltip = d3.select("#tooltip").style("display", "block");
        const svgWidth = 900, svgHeight = 600;
        const margin = { top: 40, right: 40, bottom: 60, left: 70 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;
        const svg = d3.select("#state-line-chart").append("svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleTime()
            .domain([new Date(2020, 0, 1), new Date(2023, 2, 10)]) 
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(deathTimeSeries, d => d.Deaths) * 1.1])
            .nice()
            .range([height, 0]);
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")))
            .selectAll("text")
            .attr("transform", "rotate(-45)").style("text-anchor", "end");
        g.append("g")
            .call(d3.axisLeft(y));
        const lineDeaths = d3.line()
            .x(d => x(d.Date))
            .y(d => y(d.Deaths));
        g.append("path")
            .datum(deathTimeSeries)
            .attr("class", "line")
            .attr("d", lineDeaths)
            .attr("stroke", "#000")
            .attr("fill", "none");
        svg.append("text")
            .attr("x", svgWidth / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .style("font-size", "18px")
            .style("fill", "#000")
            .text(`COVID-19 Deaths in ${state} (2020-2023)`);
        svg.append("text") // x-axis label
            .attr("x", margin.left + width / 2)
            .attr("y", svgHeight - 10)
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Year");
        svg.append("text") // y-axis label
            .attr("transform", "rotate(-90)")
            .attr("y", 5) // padding from the left edge
            .attr("x", -(margin.top + height / 2))
            .attr("dy", "1em")
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("COVID-19 Deaths");
        const latestYear = 2023;
        let pop = populationByStateYear[state] ? (populationByStateYear[state][latestYear] || "N/A") : "N/A";
        let incomeVal = incomeByState[state] || "N/A";
        let regionVal = regionByState[state] || "Unknown";
        const covidStateData = covidByStateYear.get(state);
        let maxCases = 0, maxDeaths = 0;
        if (covidStateData) {
            years.forEach(y => {
                const dataForY = covidStateData.get(y);
                if (dataForY) {
                    const maxC = d3.max(dataForY, d => d.Cases);
                    const maxD = d3.max(dataForY, d => d.Deaths);
                    if (maxC > maxCases) maxCases = maxC;
                    if (maxD > maxDeaths) maxDeaths = maxD;
                }
            });
        }
        tooltip.html(`
            <strong>State:</strong> ${state}<br/>
            <strong>Region:</strong> ${regionVal}<br/>
            <strong>Population:</strong> ${pop.toLocaleString ? pop.toLocaleString() : pop}<br/>
            <strong>Median Family Income:</strong> $${incomeVal.toLocaleString ? incomeVal.toLocaleString() : incomeVal}<br/>
            <strong>Max COVID-19 Cases (2020-2023):</strong> ${maxCases.toLocaleString()}<br/>
            <strong>Max COVID-19 Deaths (2020-2023):</strong> ${maxDeaths.toLocaleString()}
        `);
    }
}
