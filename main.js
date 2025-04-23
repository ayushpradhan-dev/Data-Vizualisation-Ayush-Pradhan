// --- Configuration ---
const heatmapMargin = { top: 30, right: 30, bottom: 100, left: 150 }; // Increased bottom/left for labels
const heatmapWidth = 700 - heatmapMargin.left - heatmapMargin.right;
const heatmapHeight = 650 - heatmapMargin.top - heatmapMargin.bottom; // Adjusted height

const lineChartMargin = { top: 30, right: 30, bottom: 40, left: 60 };
const lineChartWidth = 400 - lineChartMargin.left - lineChartMargin.right;
const lineChartHeight = 250 - lineChartMargin.top - lineChartMargin.bottom; // Height for each line chart

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNumbers = d3.range(1, 13); // Months 1-12

// --- SVG Setup ---
const heatmapSvg = d3.select("#heatmap-container")
    .attr("width", heatmapWidth + heatmapMargin.left + heatmapMargin.right)
    .attr("height", heatmapHeight + heatmapMargin.top + heatmapMargin.bottom)
    .append("g")
    .attr("transform", `translate(${heatmapMargin.left},${heatmapMargin.top})`);

const lineChartYearSvg = d3.select("#linechart-year-container")
    .attr("width", lineChartWidth + lineChartMargin.left + lineChartMargin.right)
    .attr("height", lineChartHeight + lineChartMargin.top + lineChartMargin.bottom)
    .append("g")
    .attr("transform", `translate(${lineChartMargin.left},${lineChartMargin.top})`);

const lineChartMonthSvg = d3.select("#linechart-month-container")
    .attr("width", lineChartWidth + lineChartMargin.left + lineChartMargin.right)
    .attr("height", lineChartHeight + lineChartMargin.top + lineChartMargin.bottom)
    .append("g")
    .attr("transform", `translate(${lineChartMargin.left},${lineChartMargin.top})`);

// Tooltip Setup
const heatmapTooltip = d3.select("#heatmap-tooltip");
const lineYearTooltip = d3.select("#linechart-year-tooltip");
const lineMonthTooltip = d3.select("#linechart-month-tooltip");

// --- Data Loading and Initial Processing ---
d3.csv("london_crime_combined_clean.csv").then(data => {

    // 1. Basic Parsing and Filtering
    const parseDate = d3.timeParse("%Y-%m-%d");
    data.forEach(d => {
        d.month_year = parseDate(d.month_year);
        d.count = +d.count; // Convert count to number
        d.month = d.month_year ? d.month_year.getMonth() + 1 : null; // 1-12
        d.year = d.month_year ? d.month_year.getFullYear() : null;
    });

    // Filter out rows with invalid dates or counts, and keep only 'offences' measure
    const filteredData = data.filter(d => d.month_year && !isNaN(d.count) && d.measure === 'offences');

    // Get unique values for dropdown and axes
    const offenceGroups = [...new Set(filteredData.map(d => d.offence_group))].sort();
    const boroughs = [...new Set(filteredData.map(d => d.area_name))].sort();

    // Populate dropdown
    const offenceSelect = d3.select("#offence-group-select");
    offenceSelect.selectAll("option")
        .data(offenceGroups)
        .enter()
        .append("option")
        .text(d => d)
        .attr("value", d => d);

    // --- Scales ---
    const heatmapXScale = d3.scaleBand()
        .range([0, heatmapWidth])
        .domain(monthNumbers) // 1-12
        .padding(0.05);

    const heatmapYScale = d3.scaleBand()
        .range([heatmapHeight, 0])
        .domain(boroughs)
        .padding(0.05);

    // Sequential color scale (adjust interpolation if desired, e.g., d3.interpolateBlues)
    const heatmapColorScale = d3.scaleSequential(d3.interpolateYlOrRd)
         .domain([0, 1]); // Normalized values

    // --- Axes ---
    // Heatmap Axes
    const heatmapXAxis = d3.axisBottom(heatmapXScale).tickFormat(d => months[d-1]); // Display month names
    const heatmapYAxis = d3.axisLeft(heatmapYScale);

    heatmapSvg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${heatmapHeight})`)
        .call(heatmapXAxis)
        .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)");

    heatmapSvg.append("g")
        .attr("class", "axis y-axis")
        .call(heatmapYAxis);

    // Line Chart Axes (placeholders, domains set later)
    const lineYearXScale = d3.scaleTime().range([0, lineChartWidth]);
    const lineYearYScale = d3.scaleLinear().range([lineChartHeight, 0]);
    const lineMonthXScale = d3.scalePoint().range([0, lineChartWidth]).domain(months).padding(0.5);
    const lineMonthYScale = d3.scaleLinear().range([lineChartHeight, 0]);

    const lineYearXAxis = lineChartYearSvg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${lineChartHeight})`);
    const lineYearYAxis = lineChartYearSvg.append("g")
        .attr("class", "axis y-axis");

    const lineMonthXAxis = lineChartMonthSvg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${lineChartHeight})`);
    const lineMonthYAxis = lineChartMonthSvg.append("g")
        .attr("class", "axis y-axis");

    // Line generators
    const lineYearGenerator = d3.line()
        .x(d => lineYearXScale(new Date(d.year, 0, 1))) // Use year for x-scale
        .y(d => lineYearYScale(d.count));

     const lineMonthGenerator = d3.line()
        .x(d => lineMonthXScale(months[d.month-1]))
        .y(d => lineMonthYScale(d.avg_count));

    // Path elements for lines
    const lineYearPath = lineChartYearSvg.append("path").attr("class", "line");
    const lineMonthPath = lineChartMonthSvg.append("path").attr("class", "line linechart-month");

    // Store current selection
    let selectedCellData = null;


    // --- Update Function ---
    function updateVisualizations(selectedOffenceGroup) {
        console.log("Updating for:", selectedOffenceGroup);

        // 1. Process Data for Heatmap
        const crimeByBoroughMonth = d3.group(filteredData, d => d.area_name, d => d.month);
        const heatmapData = [];

        boroughs.forEach(borough => {
            const boroughData = filteredData.filter(d => d.area_name === borough && d.offence_group === selectedOffenceGroup);
            const monthlyAvg = new Map();
            const countsByMonth = d3.group(boroughData, d => d.month);

            monthNumbers.forEach(month => {
                const monthData = countsByMonth.get(month);
                const avg = monthData ? d3.mean(monthData, d => d.count) : 0;
                monthlyAvg.set(month, avg || 0); // Store average, handle potential NaN with 0
            });

            const maxAvg = d3.max(monthlyAvg.values());

            monthlyAvg.forEach((avg, month) => {
                heatmapData.push({
                    area_name: borough,
                    month: month,
                    avg_count: avg,
                    norm_value: maxAvg > 0 ? avg / maxAvg : 0 // Avoid division by zero
                });
            });
        });


        // 2. Draw Heatmap
        const cells = heatmapSvg.selectAll(".heatmap-cell")
            .data(heatmapData, d => `${d.area_name}-${d.month}`); // Key function

        cells.enter()
            .append("rect")
            .attr("class", "heatmap-cell")
            .merge(cells) // Apply changes to both entering and updating elements
            .attr("x", d => heatmapXScale(d.month))
            .attr("y", d => heatmapYScale(d.area_name))
            .attr("width", heatmapXScale.bandwidth())
            .attr("height", heatmapYScale.bandwidth())
            .style("fill", d => heatmapColorScale(d.norm_value))
             .on("mouseover", (event, d) => {
                heatmapTooltip.style("opacity", 1)
                              .html(`Borough: ${d.area_name}<br>Month: ${months[d.month-1]}<br>Avg Offences: ${d.avg_count.toFixed(1)}`)
                              .style("left", (event.pageX + 10) + "px")
                              .style("top", (event.pageY - 20) + "px");
                d3.select(event.currentTarget).style("stroke", "#000").style("stroke-width", "1px");
             })
            .on("mouseout", (event, d) => {
                heatmapTooltip.style("opacity", 0);
                 // Only reset stroke if not selected
                if (!d3.select(event.currentTarget).classed("selected")) {
                   d3.select(event.currentTarget).style("stroke", "#eee").style("stroke-width", "0.5px");
                }
            })
            .on("click", (event, d) => {
                 // Store clicked data
                 selectedCellData = d;

                 // Update selected cell visual cue
                 heatmapSvg.selectAll(".heatmap-cell").classed("selected", false).style("stroke", "#eee").style("stroke-width", "0.5px"); // Clear previous
                 d3.select(event.currentTarget).classed("selected", true).style("stroke", "#000").style("stroke-width", "2px"); // Highlight selected

                 // Update Line Charts
                 updateLineCharts(selectedOffenceGroup, d.area_name, d.month);
            });

        cells.exit().remove();

        // Clear line charts initially when offence group changes
        clearLineCharts();
    }

    // --- Update Line Charts Function ---
    function updateLineCharts(offenceGroup, borough, month) {
         console.log(`Updating line charts for: ${offenceGroup}, ${borough}, Month ${month}`);

         // --- Chart 1: Yearly Trend for Selected Month ---
         const yearData = filteredData.filter(d =>
             d.offence_group === offenceGroup &&
             d.area_name === borough &&
             d.month === month
         ).sort((a, b) => a.year - b.year); // Ensure data is sorted by year

        if (yearData.length > 0) {
            // Update scales
            lineYearXScale.domain(d3.extent(yearData, d => new Date(d.year, 0, 1))); // Use Date objects for time scale
            lineYearYScale.domain([0, d3.max(yearData, d => d.count) * 1.1]); // Add padding

            // Update axes
            lineYearXAxis.transition().duration(300).call(d3.axisBottom(lineYearXScale).ticks(5)); // Adjust tick count as needed
            lineYearYAxis.transition().duration(300).call(d3.axisLeft(lineYearYScale).ticks(5));

            // Update line path
            lineYearPath
                .datum(yearData)
                .transition().duration(300)
                .attr("d", lineYearGenerator);

            // Update title
            d3.select("#linechart-year-title").text(`Offences in ${borough} - ${months[month-1]} (Yearly Trend)`);
        } else {
            // Clear chart if no data
            clearLineChartYear();
             d3.select("#linechart-year-title").text(`No Data for ${borough} - ${months[month-1]}`);
        }


         // --- Chart 2: Average Seasonal Pattern for Borough ---
         const boroughAvgData = [];
         const boroughAllTimeData = filteredData.filter(d => d.area_name === borough && d.offence_group === offenceGroup);
         const countsByMonthBorough = d3.group(boroughAllTimeData, d => d.month);

         monthNumbers.forEach(m => {
             const monthData = countsByMonthBorough.get(m);
             const avg = monthData ? d3.mean(monthData, d => d.count) : 0;
             boroughAvgData.push({ month: m, avg_count: avg || 0 });
         });


         if (boroughAvgData.some(d=>d.avg_count > 0)) { // Check if there's any non-zero avg data
             // Update scales
             lineMonthYScale.domain([0, d3.max(boroughAvgData, d => d.avg_count) * 1.1]); // Add padding

             // Update axes
             lineMonthXAxis.transition().duration(300).call(d3.axisBottom(lineMonthXScale));
             lineMonthYAxis.transition().duration(300).call(d3.axisLeft(lineMonthYScale).ticks(5));

             // Update line path
             lineMonthPath
                 .datum(boroughAvgData)
                 .transition().duration(300)
                 .attr("d", lineMonthGenerator);

             // Update title
             d3.select("#linechart-month-title").text(`Avg. Monthly Offences in ${borough}`);
         } else {
              // Clear chart if no data
             clearLineChartMonth();
             d3.select("#linechart-month-title").text(`No Data for ${borough}`);
         }
    }

     // --- Helper Functions to Clear Charts ---
     function clearLineCharts() {
        clearLineChartYear();
        clearLineChartMonth();
        d3.select("#linechart-year-title").text("Click Heatmap Cell for Yearly Trend");
        d3.select("#linechart-month-title").text("Click Heatmap Cell for Avg. Seasonal Pattern");
        heatmapSvg.selectAll(".heatmap-cell").classed("selected", false).style("stroke", "#eee").style("stroke-width", "0.5px"); // Clear selection
     }

    function clearLineChartYear() {
         lineYearPath.attr("d", null); // Remove path data
         lineYearXAxis.call(d3.axisBottom(lineYearXScale).tickValues([])); // Clear ticks
         lineYearYAxis.call(d3.axisLeft(lineYearYScale).tickValues([])); // Clear ticks
     }
     function clearLineChartMonth() {
         lineMonthPath.attr("d", null); // Remove path data
         lineMonthXAxis.call(d3.axisBottom(lineMonthXScale)); // Keep month labels
         lineMonthYAxis.call(d3.axisLeft(lineMonthYScale).tickValues([])); // Clear ticks
     }

    // --- Event Listener for Dropdown ---
    offenceSelect.on("change", (event) => {
        const selectedGroup = event.target.value;
        updateVisualizations(selectedGroup);
    });

    // --- Initial Draw ---
    const initialGroup = offenceGroups[0]; // Select the first group by default
    offenceSelect.property("value", initialGroup); // Set dropdown default
    updateVisualizations(initialGroup);

}).catch(error => {
    console.error("Error loading or processing data:", error);
    // Display error message to the user on the page
    d3.select("body").append("p")
      .style("color", "red")
      .text("Failed to load crime data. Please check the console for details and ensure the CSV file 'london_crime_combined_clean.csv' is accessible.");
});