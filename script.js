document.addEventListener('DOMContentLoaded', init);

async function init() {
    const scenes = ['#scene-1', '#scene-2', '#scene-3'];
    let currentScene = 0;

    const months = [];
    for (let y = 2020; y <= 2022; y++) {
        for (let m = 0; m < 12; m++) {
            months.push(new Date(y, m, 1));
        }
    }

    for (let y = 2023; y <= 2023; y++) { 
        for (let m = 0; m < 3; m++) {
            months.push(new Date(y, m, 1));
        }
    }
    const years = [2020, 2021, 2022, 2023];

    // loading data
    const [incomeRaw, populationRaw, regionRaw, covidRaw] = await Promise.all([
        d3.csv("median_family_income.csv", d => ({
            State: d.State,
            Value: +d.Value,
        })),
        d3.csv("state_population.csv", d => ({
            State: d.State,
            Year: +d.Year,
            Population: +d.Population
        })),
        d3.csv("states_region.csv", d => ({
            State: d.State,
            Region: d.Region,
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

    // scatter data
    const covidByStateYear = d3.group(covidRaw, d => d.State, d => d.Date.getFullYear());

    // SCENE 1 DATA (for each month, for each state, get max cases per state in that month, then mean across states)
    const avgMaxCasesByMonth = months.map(monthStart => {
        const maxCasesStates = [];
        covidByStateYear.forEach((yearMap, state) => {
            const dataInMonth = covidRaw.filter(d =>
                d.State === state &&
                d.Date.getFullYear() === monthStart.getFullYear() &&
                d.Date.getMonth() === monthStart.getMonth()
            );
            if (dataInMonth.length) {
                const maxCases = d3.max(dataInMonth, d => d.Cases);
                maxCasesStates.push(maxCases);
            }
        });
        return {
            Month: new Date(monthStart),
            AvgMaxCases: d3.mean(maxCasesStates)
        };
    });

    // SCENE 2 DATA
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
            region: regionByState[state]
        });
    });

    // colors for legend (scene 2)
    const regionColors = {
        "Northeast": "#1f77b4",
        "Midwest": "#ff7f0e",
        "South": "#2ca02c",
        "West": "#d62728"
    };

    // state dropdown (scene 3)
    const stateSelect = d3.select("#state-select");
    Object.keys(incomeByState).sort().forEach(state => {
        stateSelect.append("option").attr("value", state).text(state);
    });

    // scene button handlers
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
        updateScene3(selectedState); // always call
    });

    // initial render
    updateScene();
    function updateScene() {
        if (currentScene === 0) {
            renderScene1(avgMaxCasesByMonth);
        } else if (currentScene === 1) {
            renderScene2(scatterData);
        } else if (currentScene === 2) {
            const selectedState = stateSelect.property('value');
            updateScene3(selectedState);
        }
        updateButtons();
    }

    // SCENE 1 (line chart)
    function renderScene1(data) {
        d3.select("#line-chart").selectAll("*").remove();
        const svgWidth = 900, svgHeight = 600;
        const margin = { top: 60, right: 60, bottom: 70, left: 90 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;
        const svg = d3.select("#line-chart").append("svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleTime() // x-axis is months
            .domain(d3.extent(data, d => d.Month))
            .range([0, width]);
        const y = d3.scaleLinear() // y-axis is avg max cases
            .domain([0, d3.max(data, d => d.AvgMaxCases) * 1.1])
            .nice()
            .range([height, 0]);

        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(
                d3.axisBottom(x)
                    .ticks(d3.timeMonth.every(3)) // show every 3rd month
                    .tickFormat(d3.timeFormat("%b %Y"))
            )
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        g.append("g").call(d3.axisLeft(y));

        const line = d3.line()
            .x(d => x(d.Month))
            .y(d => y(d.AvgMaxCases));

        g.append("path")
            .datum(data)
            .attr("class", "line")
            .attr("d", line)
            .attr("stroke", "#fe0000")
            .attr("fill", "none");

        g.selectAll(".point")
            .data(data)
            .enter().append("circle")
            .attr("class", "point")
            .attr("cx", d => x(d.Month))
            .attr("cy", d => y(d.AvgMaxCases))
            .attr("r", 2).attr("fill", "#fe0000");

        svg.append("text")
            .attr("x", margin.left + width / 2)
            .attr("y", svgHeight - 10)
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Month");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 1)
            .attr("x", -(margin.top + height / 2))
            .attr("dy", "1em")
            .attr("text-anchor", "middle")
            .attr("fill", "#000")
            .style("font-weight", "bold")
            .text("Average Max COVID-19 Cases");

        const peak = data.reduce((acc, d) => d.AvgMaxCases > acc.AvgMaxCases ? d : acc, data[0]);
        const annotationData = [{
            note: { 
                label: `Peak Avg Cases: ${Math.round(peak.AvgMaxCases).toLocaleString()} (${d3.timeFormat("%b %Y")(peak.Month)})`,
                align: "middle",
                wrap: 180
            },
            x: x(peak.Month),
            y: y(peak.AvgMaxCases),
            dy: -40, dx: -70
        }];
        const makeAnnotation = d3.annotation()
            .annotations(annotationData)
            .type(d3.annotationLabel);
        g.append("g").attr("class", "annotation-group").call(makeAnnotation);
    }

    // SCENE 2 (scatter plot)
    function renderScene2(data) {
        d3.select("#scatter-plot").selectAll("*").remove();
        d3.select("#legend").selectAll("*").remove();
        const svgWidth = 900, svgHeight = 600;
        const margin = { top: 60, right: 60, bottom: 70, left: 120 };
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
            .attr("y", 50)
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
            .append("title");
        const southData = data.filter(d =>
            d.region === "South" &&
            d.income <= 95000 && // low income threshold
            d.maxCases >= 7000000 // high case threshold
        );
        if (southData.length) {
            const avgIncome = d3.mean(southData, d => d.income);
            const avgCases = d3.mean(southData, d => d.maxCases);

            const annotationData = [
                {
                    note: {
                        label: "Most lower income but higher case states are in the South",
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
                    y: y(4500000),
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
        // legend
        const legend = d3.select("#legend");
        Object.entries(regionColors).forEach(([region, color]) => {
            const item = legend.append("div").attr("class", "legend-item");
            item.append("div")
                .attr("class", "legend-color-box")
                .style("background-color", color);
            item.append("div").text(region);
        });
    }

    // SCENE 3 (line chart; drop down; reader-driven content)
    function updateScene3(state) {
        d3.select("#state-line-chart").selectAll("*").remove();
        const svgWidth = 900, svgHeight = 600;
        const margin = { top: 60, right: 60, bottom: 70, left: 90 };
        const width = svgWidth - margin.left - margin.right;
        const height = svgHeight - margin.top - margin.bottom;
        const svg = d3.select("#state-line-chart").append("svg")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        if (!state) {
            // show scene 1 initially before any state is selected
            const data = avgMaxCasesByMonth;
            const x = d3.scaleTime()
                .domain(d3.extent(data, d => d.Month))
                .range([0, width]);
            const y = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.AvgMaxCases) * 1.1])
                .nice()
                .range([height, 0]);
            g.append("g")
                .attr("transform", `translate(0,${height})`)
                .call(
                    d3.axisBottom(x)
                        .ticks(d3.timeMonth.every(3)) // Show every 3rd month
                        .tickFormat(d3.timeFormat("%b %Y"))
                )
                .selectAll("text")
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end");

            g.append("g").call(d3.axisLeft(y));

            const line = d3.line()
                .x(d => x(d.Month))
                .y(d => y(d.AvgMaxCases));

            g.append("path")
                .datum(data)
                .attr("class", "line")
                .attr("d", line)
                .attr("stroke", "#fe0000")
                .attr("fill", "none");

            g.selectAll(".point")
                .data(data)
                .enter().append("circle")
                .attr("class", "point")
                .attr("cx", d => x(d.Month))
                .attr("cy", d => y(d.AvgMaxCases))
                .attr("r", 2).attr("fill", "#fe0000");

            svg.append("text")
                .attr("x", margin.left + width / 2)
                .attr("y", svgHeight - 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#000")
                .style("font-weight", "bold")
                .text("Month");

            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", 1)
                .attr("x", -(margin.top + height / 2))
                .attr("dy", "1em")
                .attr("text-anchor", "middle")
                .attr("fill", "#000")
                .style("font-weight", "bold")
                .text("Average Max COVID-19 Cases");
            svg.append("text")
                .attr("x", svgWidth / 2)
                .attr("y", margin.top / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "18px")
                .style("fill", "#000")
                .text(`Average Max COVID-19 Cases Across All U.S. States (2020-2023)`);
            const peak = data.reduce((acc, d) => d.AvgMaxCases > acc.AvgMaxCases ? d : acc, data[0]);
            const annotationData = [{
                note: {
                    label: `Peak Avg Cases: ${Math.round(peak.AvgMaxCases).toLocaleString()} (${d3.timeFormat("%b %Y")(peak.Month)})`,
                    align: "middle",
                    wrap: 180
                },
                x: x(peak.Month),
                y: y(peak.AvgMaxCases),
                dy: -40, dx: -70
            }];
            const makeAnnotation = d3.annotation()
                .annotations(annotationData)
                .type(d3.annotationLabel);
            g.append("g").attr("class", "annotation-group").call(makeAnnotation);

            d3.select("#tooltip").style("display", "none");
        } else {
            // state is selected, then show that state's monthly max cases
            const stateData = covidRaw.filter(d =>
                d.State === state &&
                d.Date >= new Date(2020, 0, 1) &&
                d.Date <= new Date(2023, 11, 31)
            );
            const maxCasesPerMonth = months.map(monthStart => {
                const dataInMonth = stateData.filter(d =>
                    d.Date.getFullYear() === monthStart.getFullYear() &&
                    d.Date.getMonth() === monthStart.getMonth());
                return {
                    Month: new Date(monthStart),
                    MaxCases: dataInMonth.length ? d3.max(dataInMonth, d => d.Cases) : 0
                };
            });

            const x = d3.scaleTime()
                .domain(d3.extent(maxCasesPerMonth, d => d.Month))
                .range([0, width]);
            const y = d3.scaleLinear()
                .domain([0, d3.max(maxCasesPerMonth, d => d.MaxCases) * 1.1])
                .nice()
                .range([height, 0]);

            g.append("g")
                .attr("transform", `translate(0,${height})`)
                .call(
                    d3.axisBottom(x)
                        .ticks(d3.timeMonth.every(3))
                        .tickFormat(d3.timeFormat("%b %Y"))
                )
                .selectAll("text")
                .attr("transform", "rotate(-45)").style("text-anchor", "end");

            g.append("g").call(d3.axisLeft(y));

            const lineCases = d3.line()
                .x(d => x(d.Month))
                .y(d => y(d.MaxCases));

            g.append("path")
                .datum(maxCasesPerMonth)
                .attr("class", "line")
                .attr("d", lineCases)
                .attr("stroke", "#fe0000")
                .attr("fill", "none");

            g.selectAll(".point")
                .data(maxCasesPerMonth).enter().append("circle")
                .attr("class", "point")
                .attr("cx", d => x(d.Month))
                .attr("cy", d => y(d.MaxCases))
                .attr("r", 2).attr("fill", "#fe0000");

            // add annotation for the peak
            const peak = maxCasesPerMonth.reduce((acc, d) => d.MaxCases > acc.MaxCases ? d : acc, maxCasesPerMonth[0]);
            const annotationData = [{
                note: {
                    label: `Peak: ${peak.MaxCases.toLocaleString()} cases (${d3.timeFormat("%b %Y")(peak.Month)})`,
                    align: "middle",
                    wrap: 180
                },
                x: x(peak.Month),
                y: y(peak.MaxCases),
                dy: -40,
                dx: -70
            }];
            const makeAnnotation = d3.annotation()
                .annotations(annotationData)
                .type(d3.annotationLabel);
            g.append("g")
                .attr("class", "annotation-group")
                .call(makeAnnotation);

            svg.append("text")
                .attr("x", margin.left + width / 2)
                .attr("y", svgHeight - 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#000")
                .style("font-weight", "bold")
                .text("Month");

            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", 1)
                .attr("x", -(margin.top + height / 2))
                .attr("dy", "1em")
                .attr("text-anchor", "middle")
                .attr("fill", "#000")
                .style("font-weight", "bold")
                .text("Max COVID-19 Cases");

            svg.append("text")
                .attr("x", svgWidth / 2)
                .attr("y", margin.top / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "18px")
                .style("fill", "#000")
                .text(`Max COVID-19 Cases in ${state} (2020-2023)`);

            // show tooltip with state stats
            const tooltip = d3.select("#tooltip").style("display", "block");
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
}
