document.addEventListener('DOMContentLoaded', main);

async function main() {
    // Loading Data
    const [populationRaw, covidRaw, incomeRaw, regionRaw] = await Promise.all([
        d3.csv("state_population.csv", d => ({
            State: d.State,
            Year: +d.Year,
            Population: +d.Population
        })),
        d3.csv("us_states.csv", d => ({
            State: d.State,
            Date: d3.timeParse("%Y-%m-%d")(d.Date),
            Cases: +d.Cases,
            Deaths: +d.Deaths
        })),
        d3.csv("median_family_income.csv", d => ({
            State: d.State,
            Income: +d.Value
        })),
        d3.csv("states_region.csv", d => ({
            State: d.State,
            Region: d.Region
        }))
    ]);

    // Data lookups
    const stateToRegion = {};
    regionRaw.forEach(d => { stateToRegion[d.State] = d.Region; });

    const stateToIncome = {};
    incomeRaw.forEach(d => { stateToIncome[d.State] = d.Income; });

    const stateCovidStats = {}; // { State: { maxCases, deaths } }
    covidRaw.forEach(d => {
        if (!stateCovidStats[d.State]) {
            stateCovidStats[d.State] = { maxCases: 0, deaths: 0 };
        }
        if (d.Cases > stateCovidStats[d.State].maxCases)
            stateCovidStats[d.State].maxCases = d.Cases;
        if (d.Deaths > stateCovidStats[d.State].deaths)
            stateCovidStats[d.State].deaths = d.Deaths;
    });

    const allStates = Array.from(new Set(populationRaw.map(d => d.State))).sort();
    // Force consistent region order and colors
    const regions = ["South", "West", "Northeast", "Midwest"];
    const regionColor = d3.scaleOrdinal()
        .domain(regions)
        .range(["#e41a1c", "#377eb8", "#ffe12b", "#4ce0f8"]); // red, blue, yellow, cyan

    // Scene Navigation / State
    const scenes = ['#scene-1', '#scene-2', '#scene-3'];
    let currentScene = 0;

    function showScene(idx) {
        scenes.forEach((selector, i) =>
            d3.select(selector).classed('active', i === idx)
        );
        for (let i = 1; i <= 3; i++)
            d3.select("#scene-btn-" + i).classed('active', idx === i - 1);
    }

    d3.select("#scene-btn-1").on("click", () => {
        currentScene = 0;
        showScene(currentScene);
        renderScene(currentScene);
    });
    d3.select("#scene-btn-2").on("click", () => {
        currentScene = 1;
        showScene(currentScene);
        renderScene(currentScene);
    });
    d3.select("#scene-btn-3").on("click", () => {
        currentScene = 2;
        showScene(currentScene);
        renderScene(currentScene);
    });

    // Populate State Dropdown (Scene 3)
    const stateSelect = d3.select("#state-select");
    stateSelect
        .selectAll("option")
        .data(allStates)
        .enter().append("option")
        .attr("value", d => d)
        .text(d => d);

    stateSelect.on("change", () => {
        renderStateDetail(stateSelect.property("value"));
    });

    // Main Rendering Per Scene
    function renderScene(idx) {
        if (idx === 0) renderCovidDeathsLineChart();
        else if (idx === 1) renderScatterPlot();
        else if (idx === 2) renderStateDetail(stateSelect.property("value") || allStates[0]);
    }
    renderScene(currentScene);

    // SCENE 1: COVID Deaths Over Time by State
    function renderCovidDeathsLineChart() {
        d3.select("#line-chart").selectAll("*").remove();
        const deathsByState = d3.group(covidRaw, d => d.State);

        const svg = d3.select("#line-chart").append("svg")
            .attr("width", 900)
            .attr("height", 600);
        const margin = { top: 30, right: 120, bottom: 60, left: 70 },
            width = 900 - margin.left - margin.right,
            height = 600 - margin.top - margin.bottom;
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        // X-axis from Jan 1, 2020 to Jan 1, 2023, tick per year
        const x = d3.scaleTime()
            .domain([new Date(2020, 0, 1), new Date(2023, 0, 1)])
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(covidRaw, d => d.Deaths)])
            .range([height, 0]);

        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
        g.append("g").call(d3.axisLeft(y).ticks(8));

        for (let state of allStates) {
            const values = deathsByState.get(state);
            g.append("path")
                .datum(values)
                .attr("fill", "none")
                .attr("stroke", regionColor(stateToRegion[state]))
                .attr("stroke-width", 2)
                .attr("class", "state-line")
                .attr("d", d3.line()
                    .x(d => x(d.Date))
                    .y(d => y(d.Deaths))
                )
                .attr("opacity", 0.6);
        }

        // Annotation for 2020
        g.append("line")
            .attr("x1", x(new Date(2020, 0, 1)))
            .attr("x2", x(new Date(2020, 0, 1)))
            .attr("y1", 0).attr("y2", height)
            .attr("stroke", "#444").attr("stroke-dasharray", "4,2")
            .attr("stroke-width", 2);
        g.append("text")
            .attr("x", x(new Date(2020, 0, 1)) + 8).attr("y", 25)
            .attr("fill", "#444")
            .attr("font-size", 16)
            .text("Pandemic begins: 2020");

        // Legend
        const legend = svg.append("g").attr("transform", `translate(${width + margin.left + 10},${margin.top})`);
        regions.forEach((r, i) => {
            legend.append("rect")
                .attr("x", 0).attr("y", i * 24).attr("width", 18).attr("height", 18)
                .attr("fill", regionColor(r));
            legend.append("text")
                .attr("x", 24).attr("y", i * 24 + 14)
                .text(r)
                .style("font-size", "15px");
        });
    }

    // SCENE 2: Scatter Plot (Income vs. Max COVID Cases)
    function renderScatterPlot() {
        d3.select("#scatter-plot").selectAll("*").remove();
        const data = allStates.map(s => ({
            State: s,
            Income: stateToIncome[s],
            maxCases: stateCovidStats[s] ? stateCovidStats[s].maxCases : 0,
            Region: stateToRegion[s] || "Unknown"
        })).filter(d => d.Income && d.maxCases);

        const svg = d3.select("#scatter-plot").append("svg")
            .attr("width", 900).attr("height", 600);
        const margin = { top: 30, right: 150, bottom: 60, left: 70 },
            width = 900 - margin.left - margin.right,
            height = 600 - margin.top - margin.bottom,
            g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.Income)).nice()
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.maxCases)]).nice()
            .range([height, 0]);

        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x));
        g.append("g").call(d3.axisLeft(y));

        g.selectAll("circle")
            .data(data)
            .enter()
            .append("circle")
            .attr("cx", d => x(d.Income))
            .attr("cy", d => y(d.maxCases))
            .attr("r", 8)
            .attr("fill", d => regionColor(d.Region))
            .attr("opacity", 0.8)
            .attr("stroke", "#333")
            .on("mouseover", function (e, d) {
                d3.select(this).attr("stroke-width", 3);
                showTooltip(`${d.State}<br>Income: $${d.Income.toLocaleString()}<br>Cases: ${d.maxCases.toLocaleString()}`, e.pageX, e.pageY);
            })
            .on("mouseout", function () {
                d3.select(this).attr("stroke-width", 1);
                hideTooltip();
            });

        // Highlight annotation for South, low-income high-cases
        const qIncome = d3.quantile(data.map(d => d.Income).sort(d3.ascending), 0.4);
        const qCases = d3.quantile(data.map(d => d.maxCases).sort(d3.ascending), 0.6);
        const southStates = data.filter(d => d.Region === "South" && d.Income < qIncome && d.maxCases > qCases);
        if (southStates.length > 0) {
            const centroid = {
                x: d3.mean(southStates, d => x(d.Income)),
                y: d3.mean(southStates, d => y(d.maxCases))
            };
            const ann = [
                {
                    note: {
                        label: "Many lower-income, higher-case states are in the South.",
                        wrap: 200
                    },
                    x: centroid.x, y: centroid.y,
                    dx: 80, dy: -100
                }
            ];
            const makeAnnotations = d3.annotation().type(d3.annotationLabel).annotations(ann);
            g.append("g").call(makeAnnotations);
        }
        // Legend
        const legend = svg.append("g").attr("transform", `translate(${width + margin.left + 30},${margin.top})`);
        regions.forEach((r, i) => {
            legend.append("rect")
                .attr("x", 0).attr("y", i * 24).attr("width", 18).attr("height", 18)
                .attr("fill", regionColor(r));
            legend.append("text")
                .attr("x", 24).attr("y", i * 24 + 14)
                .text(r)
                .style("font-size", "15px");
        });
    }

    // SCENE 3: Interactive State Details
    function renderStateDetail(stateName) {
        d3.select("#state-detail-chart").selectAll("*").remove();
        d3.select("#state-panel").selectAll("*").remove();
        const popSeries = populationRaw.filter(d => d.State === stateName);
        const covid = stateCovidStats[stateName] || { maxCases: 0, deaths: 0 };
        const income = stateToIncome[stateName] || 'N/A';
        const region = stateToRegion[stateName] || 'N/A';

        const svg = d3.select("#state-detail-chart").append("svg")
            .attr("width", 420)
            .attr("height", 280);

        const margin = { top: 30, right: 10, bottom: 50, left: 60 },
            width = 420 - margin.left - margin.right,
            height = 280 - margin.top - margin.bottom;

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const x = d3.scaleLinear()
            .domain(d3.extent(popSeries, d => d.Year || 0))
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(popSeries, d => d.Population)])
            .range([height, 0]);

        g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));
        g.append("g").call(d3.axisLeft(y).ticks(5));

        g.append("path")
            .datum(popSeries)
            .attr("fill", "none")
            .attr("stroke", regionColor(region))
            .attr("stroke-width", 4)
            .attr("d", d3.line()
                .x(d => x(d.Year))
                .y(d => y(d.Population))
            );

        let covid2020 = popSeries.find(d => d.Year === 2020);
        if (covid2020) {
            g.append("circle")
                .attr("cx", x(2020))
                .attr("cy", y(covid2020.Population))
                .attr("r", 8)
                .attr("fill", "red")
                .attr("opacity", 0.7);
            const ann = [
                {
                    note: {
                        label: "COVID-19 impact in 2020",
                        wrap: 100
                    },
                    x: x(2020),
                    y: y(covid2020.Population),
                    dx: 35,
                    dy: -40
                }
            ];
            const makeAnnotations = d3.annotation().type(d3.annotationLabel).annotations(ann);
            g.append("g").call(makeAnnotations);
        }
        // State detail info
        const panel = d3.select("#state-panel");
        panel.html(`
            <b>${stateName}</b><br>
            Region: ${region}<br>
            Median Family Income: $${income}<br>
            Max COVID-19 Cases: ${covid.maxCases.toLocaleString()}<br>
            Total COVID-19 Deaths: ${covid.deaths.toLocaleString()}<br>
        `);
    }

    // Tooltip Helpers
    function showTooltip(html, x, y) {
        let tip = d3.select("body").selectAll(".d3-tip").data([null]);
        tip = tip.enter().append("div").attr("class", "d3-tip").merge(tip);
        tip.html(html)
            .style("position", "absolute")
            .style("background", "#fff")
            .style("border", "1px solid #999")
            .style("padding", "8px")
            .style("pointer-events", "none")
            .style("border-radius", "6px")
            .style("left", (x + 12) + "px")
            .style("top", (y - 28) + "px")
            .style("font-size", "15px")
            .style("z-index", 1000);
    }
    function hideTooltip() {
        d3.selectAll(".d3-tip").remove();
    }
}
