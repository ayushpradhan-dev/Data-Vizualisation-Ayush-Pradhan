// --- Configuration ---
const heatmapMargin = { top: 20, right: 20, bottom: 100, left: 130 }; // Increased bottom margin for legend
const heatmapContainerWidth = document.getElementById('heatmap-area').clientWidth || 800;
const heatmapWidth = heatmapContainerWidth - heatmapMargin.left - heatmapMargin.right;
const heatmapHeight = 650 - heatmapMargin.top - heatmapMargin.bottom;

const lineChartMargin = { top: 30, right: 30, bottom: 50, left: 60 };
const lineChartContainerWidth = (document.getElementById('linechart-area').clientWidth || 500) * 0.95;
const lineChartWidth = lineChartContainerWidth - lineChartMargin.left - lineChartMargin.right;
const lineChartHeight = 250 - lineChartMargin.top - lineChartMargin.bottom;

const legendBarHeight = 15;
const legendWidth = 300;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthNumbers = d3.range(1, 13);

// --- SVG Setup ---
// Heatmap SVG
const heatmapSvg = d3.select("#heatmap-container") // Select the SVG element directly
    .attr("width", heatmapWidth + heatmapMargin.left + heatmapMargin.right)
    .attr("height", heatmapHeight + heatmapMargin.top + heatmapMargin.bottom) // Adjust height later if needed for legend
    .append("g")
    .attr("transform", `translate(${heatmapMargin.left},${heatmapMargin.top})`);

// Line Chart SVGs
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

// Hover Circle Setup
const lineYearHoverCircle = lineChartYearSvg.append("circle")
    .attr("class", "hover-circle")
    .attr("r", 4)
    .style("opacity", 0);

const lineMonthHoverCircle = lineChartMonthSvg.append("circle")
    .attr("class", "hover-circle")
    .attr("r", 4)
    .style("opacity", 0);

const brushInfoDiv = d3.select("#brush-info");

// --- Data Loading and Initial Processing ---
d3.csv("london_crime_combined_clean.csv").then(data => {
    // console.log("Raw data loaded:", data.length, "rows. First row:", data[0]);

    const parseDate = d3.timeParse("%Y-%m-%d");
    data.forEach(d => {
        d.month_year = parseDate(d.month_year);
        d.count = +d.count;
        d.month = d.month_year ? d.month_year.getMonth() + 1 : null;
        d.year = d.month_year ? d.month_year.getFullYear() : null;
        d.area_type = d.area_type ? d.area_type.toLowerCase() : null;
        d.area_name = typeof d.area_name === 'string' ? d.area_name.toLowerCase() : 'unknown';
        d.offence_group = typeof d.offence_group === 'string' ? d.offence_group.toLowerCase() : 'unknown';
    });

    const filteredData = data.filter(d => d.month_year && !isNaN(d.count) && d.measure === 'offences');
    // console.log("Filtered data (offences only):", filteredData.length, "rows.");

    const boroughLevelData = filteredData.filter(d => d.area_type === 'borough');
    // console.log("Borough level data:", boroughLevelData.length, "rows. First borough row:", boroughLevelData[0]);

    if (boroughLevelData.length === 0) {
        console.error("No data found with area_type 'borough'. Check CSV and cleaning script.");
        d3.select(".main-container").append("p").style("color", "red").text("Error: Could not find any Borough-level data. Heatmap cannot be generated.");
        return;
    }

    // Get unique values (FILTERING 'unknown' borough and offence group)
    const offenceGroups = [...new Set(boroughLevelData.map(d => d.offence_group))]
                            .filter(g => g && g !== 'unknown') // Filter null/undefined AND 'unknown'
                            .sort();
    const boroughs = [...new Set(boroughLevelData.map(d => d.area_name))]
                          .filter(b => b && b !== 'unknown')
                          .sort();
    // console.log("Unique Offence Groups found:", offenceGroups.length);
    // console.log("Unique Boroughs found:", boroughs.length);

    if (offenceGroups.length === 0 || boroughs.length === 0) {
        console.error("No valid offence groups or boroughs found after filtering.");
        d3.select(".main-container").append("p").style("color", "red").text("Error: No valid offence groups or boroughs found.");
        return;
    }


    // Populate dropdown
    const offenceSelect = d3.select("#offence-group-select");
    offenceSelect.selectAll("option")
        .data(offenceGroups)
        .join("option")
        .text(d => d.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '))
        .attr("value", d => d);

    // --- Scales ---
    const heatmapXScale = d3.scaleBand().range([0, heatmapWidth]).domain(monthNumbers).padding(0.05);
    const heatmapYScale = d3.scaleBand().range([heatmapHeight, 0]).domain(boroughs).padding(0.05);
    const numColorBins = 7;
    const colorScheme = d3.schemeOrRd[numColorBins];
    const heatmapColorScale = d3.scaleQuantize().domain([0, 1]).range(colorScheme);

    // --- Axes ---
    const heatmapXAxisGenerator = d3.axisBottom(heatmapXScale).tickFormat(d => months[d - 1]);
    const heatmapYAxisGenerator = d3.axisLeft(heatmapYScale);
    heatmapSvg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${heatmapHeight})`).call(heatmapXAxisGenerator).selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", ".15em").attr("transform", "rotate(-45)");
    heatmapSvg.append("g").attr("class", "axis y-axis").call(heatmapYAxisGenerator);

    // --- Line Chart Scales & Axes ---
    const lineYearXScale = d3.scaleTime().range([0, lineChartWidth]);
    const lineYearYScale = d3.scaleLinear().range([lineChartHeight, 0]);
    const lineMonthXScale = d3.scalePoint().range([0, lineChartWidth]).domain(months).padding(0.5);
    const lineMonthYScale = d3.scaleLinear().range([lineChartHeight, 0]);

    const lineYearXAxisG = lineChartYearSvg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${lineChartHeight})`);
    const lineYearYAxisG = lineChartYearSvg.append("g").attr("class", "axis y-axis");
    const lineMonthXAxisG = lineChartMonthSvg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${lineChartHeight})`);
    const lineMonthYAxisG = lineChartMonthSvg.append("g").attr("class", "axis y-axis");

    // Gridline Setup
    function make_y_gridlines(yScale) { return d3.axisLeft(yScale).ticks(5) }
    const yearGridlines = lineChartYearSvg.append("g").attr("class", "gridline").attr("opacity", 0);
    const monthGridlines = lineChartMonthSvg.append("g").attr("class", "gridline").attr("opacity", 0);

    // Line generators
    const lineYearGenerator = d3.line()
        .x(d => lineYearXScale(new Date(d.year, d.month - 1, 1)))
        .y(d => lineYearYScale(d.count))
        .defined(d => d.year != null && d.month != null && d.count != null && !isNaN(d.count)); // Stricter defined check

     const lineMonthGenerator = d3.line()
        .x(d => lineMonthXScale(months[d.month-1]))
        .y(d => lineMonthYScale(d.avg_count))
        .defined(d => d.month != null && d.avg_count != null && !isNaN(d.avg_count)); // Stricter defined check

    // Path elements
    const lineYearPath = lineChartYearSvg.append("path").attr("class", "line");
    const lineMonthPath = lineChartMonthSvg.append("path").attr("class", "line linechart-month");

    // --- Brushing Setup ---
    let currentYearDataForBrush = [];
    const brush = d3.brushX()
        .extent([[0, 0], [lineChartWidth, lineChartHeight]])
        .on("end", handleBrushEnd);
    const brushG = lineChartYearSvg.append("g").attr("class", "brush").call(brush);

    // Store current selection
    let selectedCellData = null;

    // --- Main Update Function ---
    function updateVisualizations(selectedOffenceGroup) {
        // console.log("UpdateViz called with group:", selectedOffenceGroup);
        if (!boroughs || boroughs.length === 0) { /* ... error handling ... */ return; }

        const heatmapData = [];
        boroughs.forEach(borough => {
            const boroughOffenceData = boroughLevelData.filter(d =>
                d.area_name === borough && d.offence_group === selectedOffenceGroup
            );
            const monthlyAvg = new Map();
            const countsByMonth = d3.group(boroughOffenceData, d => d.month);
            let maxAvg = 0;
            monthNumbers.forEach(month => {
                const monthData = countsByMonth.get(month);
                const avg = monthData ? d3.mean(monthData, d => d.count) : 0;
                const validAvg = avg || 0;
                monthlyAvg.set(month, validAvg);
                if (validAvg > maxAvg) maxAvg = validAvg;
            });
            monthlyAvg.forEach((avg, month) => {
                heatmapData.push({
                    area_name: borough, month: month, avg_count: avg,
                    norm_value: maxAvg > 0 ? avg / maxAvg : 0
                });
            });
        });
        // console.log("Heatmap data calculated:", heatmapData.length);

        // Draw Heatmap Cells
        heatmapSvg.selectAll(".heatmap-cell")
            .data(heatmapData, d => `${d.area_name}-${d.month}`)
            .join(
                enter => enter.append("rect")
                    .attr("class", "heatmap-cell")
                    .attr("x", d => heatmapXScale(d.month))
                    .attr("y", d => heatmapYScale(d.area_name))
                    .attr("width", heatmapXScale.bandwidth())
                    .attr("height", heatmapYScale.bandwidth())
                    .style("fill", "#eee")
                    .call(attachHeatmapHandlers) // Attach handlers
                    .transition().duration(300)
                    .style("fill", d => heatmapColorScale(d.norm_value)),
                update => update
                    .call(update => update.transition().duration(300)
                        .attr("x", d => heatmapXScale(d.month))
                        .attr("y", d => heatmapYScale(d.area_name))
                        .style("fill", d => heatmapColorScale(d.norm_value))),
                exit => exit.remove()
            );

        function attachHeatmapHandlers(selection) {
            selection
                .on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut)
                .on("click", handleClick);
        }
        function handleMouseOver(event, d) {
            heatmapTooltip.style("opacity", 1)
                .html(`Borough: ${d.area_name.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}<br>Month: ${months[d.month - 1]}<br>Avg Offences: ${d.avg_count.toFixed(1)}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 20) + "px");
            d3.select(this).style("stroke", "#000").style("stroke-width", "1.5px");
        }
        function handleMouseOut(event, d) {
            heatmapTooltip.style("opacity", 0);
            if (!d3.select(this).classed("selected")) {
                d3.select(this).style("stroke", "#fff").style("stroke-width", "0.5px");
            }
        }
        function handleClick(event, d) {
            selectedCellData = d; // Store selected data
            heatmapSvg.selectAll(".heatmap-cell").classed("selected", false).style("stroke", "#fff").style("stroke-width", "0.5px"); // Clear previous
            d3.select(this).classed("selected", true).style("stroke", "#000").style("stroke-width", "2.5px"); // Highlight new
            updateLineCharts(selectedOffenceGroup, d.area_name, d.month, boroughLevelData); // Update line charts
        }

        drawHeatmapLegend(heatmapColorScale);

        if (!selectedCellData || selectedCellData.offence_group !== selectedOffenceGroup) {
            clearLineChartsAndBrush();
            selectedCellData = null;
        }
    } // --- End updateVisualizations ---


    // --- Update Line Charts Function ---
    function updateLineCharts(offenceGroup, borough, month, sourceData) {
        // console.log(`Updating line charts for: ${offenceGroup}, ${borough}, Month ${month}`);

        // Chart 1: Yearly Trend
        const yearData = sourceData.filter(d =>
            d.offence_group === offenceGroup && d.area_name === borough && d.month === month
        ).sort((a, b) => a.year - b.year);
        currentYearDataForBrush = yearData;

        if (yearData.length > 0) {
             const yearsDateObjects = yearData.map(d => new Date(d.year, 0, 1)); // Use Jan 1st for unique year point
             const extentYears = d3.extent(yearsDateObjects);
             // Pad extent slightly if only one year
             if (extentYears[0].getTime() === extentYears[1].getTime()) {
                extentYears[0].setFullYear(extentYears[0].getFullYear() - 1);
                extentYears[1].setFullYear(extentYears[1].getFullYear() + 1);
             }

            lineYearXScale.domain(extentYears);
            lineYearYScale.domain([0, d3.max(yearData, d => d.count) * 1.1 || 10]).nice(); // Use nice() for better ticks

            lineYearXAxisG.transition().duration(300).call(d3.axisBottom(lineYearXScale).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
            lineYearYAxisG.transition().duration(300).call(d3.axisLeft(lineYearYScale).ticks(5));
            yearGridlines.transition().duration(300).attr("opacity", 1).call(make_y_gridlines(lineYearYScale).tickSize(-lineChartWidth).tickFormat(""));

            lineYearPath.datum(yearData).transition().duration(300).attr("d", lineYearGenerator);

            addHoverInteraction(lineChartYearSvg, yearData, lineYearXScale, lineYearYScale, lineYearHoverCircle, lineYearTooltip, true);
            const capBorough = borough.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
            d3.select("#linechart-year-title").text(`Offences in ${capBorough} - ${months[month - 1]} (Yearly Trend)`);
            clearBrush();

        } else {
            clearLineChartYear();
            const capBorough = borough.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
            d3.select("#linechart-year-title").text(`No Data for ${capBorough} - ${months[month - 1]}`);
        }

        // Chart 2: Average Seasonal Pattern
        const boroughAvgData = [];
        const boroughAllTimeData = sourceData.filter(d => d.area_name === borough && d.offence_group === offenceGroup);
        const countsByMonthBorough = d3.group(boroughAllTimeData, d => d.month);
        monthNumbers.forEach(m => {
            const monthData = countsByMonthBorough.get(m);
            boroughAvgData.push({ month: m, avg_count: (monthData ? d3.mean(monthData, d => d.count) : 0) || 0 });
        });

        if (boroughAvgData.some(d => d.avg_count > 0)) {
            lineMonthYScale.domain([0, d3.max(boroughAvgData, d => d.avg_count) * 1.1 || 10]).nice();

            lineMonthXAxisG.transition().duration(300).call(d3.axisBottom(lineMonthXScale));
            lineMonthYAxisG.transition().duration(300).call(d3.axisLeft(lineMonthYScale).ticks(5));
            monthGridlines.transition().duration(300).attr("opacity", 1).call(make_y_gridlines(lineMonthYScale).tickSize(-lineChartWidth).tickFormat(""));

            lineMonthPath.datum(boroughAvgData).transition().duration(300).attr("d", lineMonthGenerator);

            addHoverInteraction(lineChartMonthSvg, boroughAvgData, lineMonthXScale, lineMonthYScale, lineMonthHoverCircle, lineMonthTooltip, false);
            const capBorough = borough.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
            d3.select("#linechart-month-title").text(`Avg. Monthly Offences in ${capBorough}`);
        } else {
            clearLineChartMonth();
            const capBorough = borough.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
            d3.select("#linechart-month-title").text(`No Data for ${capBorough}`);
        }
    } // --- End updateLineCharts ---


    // --- Heatmap Legend Function ---
    function drawHeatmapLegend(colorScale) {
        heatmapSvg.select(".heatmap-legend-group").remove();

        const legendGroup = heatmapSvg.append("g")
            .attr("class", "heatmap-legend-group")
            .attr("transform", `translate(${(heatmapWidth - legendWidth) / 2}, ${heatmapHeight + 45})`); // Position below heatmap

        legendGroup.append("text")
            .attr("class", "legend-title")
            .attr("x", legendWidth / 2)
            .attr("y", -8)
            .text("Relative Monthly Intensity");

        const defs = legendGroup.append("defs");
        const linearGradient = defs.append("linearGradient").attr("id", "heatmap-gradient");
        const legendColors = colorScale.range();
        const n = legendColors.length;
        linearGradient.selectAll("stop").data(legendColors).join("stop")
            .attr("offset", (d, i) => `${(i / (n - 1)) * 100}%`)
            .attr("stop-color", d => d);

        legendGroup.append("rect")
            .attr("class", "legend-gradient-rect")
            .attr("width", legendWidth)
            .attr("height", legendBarHeight)
            .style("fill", "url(#heatmap-gradient)");

        legendGroup.append("text")
            .attr("class", "legend-label-low")
            .attr("x", 0)
            .attr("y", legendBarHeight + 12)
            .text("Low");

        legendGroup.append("text")
            .attr("class", "legend-label-high")
            .attr("x", legendWidth)
            .attr("y", legendBarHeight + 12)
            .text("High");
    } // --- End drawHeatmapLegend ---


    // --- Brushing Handler ---
    function handleBrushEnd(event) {
        const selection = event.selection;
        if (!selection || !currentYearDataForBrush || currentYearDataForBrush.length === 0) {
            brushInfoDiv.text("");
            return;
        }
        const [x0, x1] = selection;
        const [startDate, endDate] = [lineYearXScale.invert(x0), lineYearXScale.invert(x1)];

        const brushedData = currentYearDataForBrush.filter(d => {
             // Ensure year/month are valid before creating Date
             if (d.year == null || d.month == null) return false;
            const currentDate = new Date(d.year, d.month - 1, 1);
            return currentDate >= startDate && currentDate <= endDate;
        });

        if (brushedData.length > 0) {
            const avgCount = d3.mean(brushedData, d => d.count);
            const totalCount = d3.sum(brushedData, d => d.count);
            const yearFormat = d3.timeFormat("%Y");

            brushInfoDiv.html(`Brushed Period (${yearFormat(startDate)} - ${yearFormat(endDate)}):<br>Avg Offences: ${avgCount != null ? avgCount.toFixed(1) : 'N/A'}, Total: ${totalCount != null ? totalCount : 'N/A'}`);
        } else {
            brushInfoDiv.text("No data in selected period.");
        }
    } // --- End handleBrushEnd ---


    // --- Clear Brush Function ---
    function clearBrush() {
        if (brushG && brush) {
           brushG.call(brush.move, null);
        }
        brushInfoDiv.text("");
    }


    // --- Helper function for Hover Interactions ---
    function addHoverInteraction(svgElement, lineData, xScale, yScale, hoverCircle, tooltip, isYearChart) {
        if (!lineData || lineData.length === 0) {
            svgElement.selectAll(".hover-overlay").remove();
            return;
        }

        if (isYearChart) lineData.sort((a, b) => a.year - b.year);
        else lineData.sort((a, b) => a.month - b.month);

        const bisectorDate = d3.bisector(d => new Date(d.year, d.month - 1, 1)).left;

        svgElement.selectAll(".hover-overlay").remove();
        const overlay = svgElement.append("rect")
            .attr("class", "hover-overlay")
            .attr("width", lineChartWidth)
            .attr("height", lineChartHeight);

        overlay
            .on("mouseout", () => {
                hoverCircle.style("opacity", 0);
                tooltip.style("opacity", 0);
            })
            .on("mousemove", (event) => {
                 if (!lineData || lineData.length === 0) return;

                const [pointerX] = d3.pointer(event);
                let d = null;
                let index = -1;

                if (isYearChart) {
                    const xValue = xScale.invert(pointerX);
                    index = bisectorDate(lineData, xValue, 1);
                    const d0 = lineData[index - 1];
                    const d1 = lineData[index];
                    if (d0 && d1) {
                        d = xValue - new Date(d0.year, d0.month - 1, 1) > new Date(d1.year, d1.month - 1, 1) - xValue ? d1 : d0;
                    } else {
                        d = d0 || d1;
                    }
                } else {
                    let minDist = Infinity;
                    let closestIndex = -1;
                    lineData.forEach((pointData, i) => {
                        const monthStr = months[pointData.month - 1];
                        const xPos = xScale(monthStr);
                        if (xPos !== undefined && !isNaN(xPos)) {
                            const dist = Math.abs(xPos - pointerX);
                            if (dist < minDist) {
                                minDist = dist;
                                closestIndex = i;
                            }
                        }
                    });
                     if (closestIndex !== -1) {
                         d = lineData[closestIndex];
                     }
                }

                if (d) {
                    let hoverX, hoverY, tooltipText;
                    if (isYearChart) {
                        if (d.year == null || d.month == null || d.count == null || isNaN(d.count)) return; // Check data point validity
                        hoverX = xScale(new Date(d.year, d.month - 1, 1));
                        hoverY = yScale(d.count);
                        tooltipText = `Year: ${d.year}<br>Count: ${d.count}`;
                    } else {
                        if (d.month == null || d.avg_count == null || isNaN(d.avg_count)) return; // Check data point validity
                        hoverX = xScale(months[d.month - 1]);
                        hoverY = yScale(d.avg_count);
                        tooltipText = `Month: ${months[d.month - 1]}<br>Avg Count: ${d.avg_count.toFixed(1)}`;
                    }

                    if (hoverX !== undefined && !isNaN(hoverX) && hoverY !== undefined && !isNaN(hoverY)) {
                        hoverCircle.attr("cx", hoverX).attr("cy", hoverY).style("opacity", 1);
                        tooltip.style("opacity", 1)
                            .html(tooltipText)
                            .style("left", (event.pageX + 15) + "px")
                            .style("top", (event.pageY - 28) + "px");
                    } else {
                        hoverCircle.style("opacity", 0);
                        tooltip.style("opacity", 0);
                    }
                } else {
                    hoverCircle.style("opacity", 0);
                    tooltip.style("opacity", 0);
                }
            });
    } // --- End addHoverInteraction ---


    // --- Clear Charts Function ---
    function clearLineChartsAndBrush() {
        clearLineChartYear();
        clearLineChartMonth();
        clearBrush();
        d3.select("#linechart-year-title").text("Click Heatmap Cell for Yearly Trend");
        d3.select("#linechart-month-title").text("Click Heatmap Cell for Avg. Seasonal Pattern");
        heatmapSvg.selectAll(".heatmap-cell").classed("selected", false).style("stroke", "#fff").style("stroke-width", "0.5px");
    }
    function clearLineChartYear() {
        lineYearPath.attr("d", null);
        lineYearXAxisG.call(d3.axisBottom(lineYearXScale).tickValues([]));
        lineYearYAxisG.call(d3.axisLeft(lineYearYScale).tickValues([]));
        yearGridlines.attr("opacity", 0);
        lineYearHoverCircle.style("opacity", 0);
        lineChartYearSvg.selectAll(".hover-overlay").remove();
    }
    function clearLineChartMonth() {
        lineMonthPath.attr("d", null);
        lineMonthXAxisG.call(d3.axisBottom(lineMonthXScale));
        lineMonthYAxisG.call(d3.axisLeft(lineMonthYScale).tickValues([]));
        monthGridlines.attr("opacity", 0);
        lineMonthHoverCircle.style("opacity", 0);
        lineChartMonthSvg.selectAll(".hover-overlay").remove();
    }

    // --- Event Listener & Initial Draw ---
    offenceSelect.on("change", (event) => {
        const selectedGroup = event.target.value;
        selectedCellData = null; // Reset selection when group changes
        updateVisualizations(selectedGroup);
    });

    const initialGroup = offenceGroups.length > 0 ? offenceGroups[0] : null;
    if (initialGroup) {
        offenceSelect.property("value", initialGroup);
        updateVisualizations(initialGroup);
    } else {
        console.error("Initialization failed: No valid initial offence group.");
        d3.select(".main-container").append("p").style("color", "red").text("Error: Could not initialize visualization. No valid data found.");
    }

}).catch(error => {
    console.error("Fatal Error: Could not load or parse data file.", error);
    d3.select(".main-container").append("p")
      .style("color", "red")
      .html("<strong>Fatal Error:</strong> Failed to load crime data.<br>Please check the browser console (F12) for details and ensure 'london_crime_combined_clean.csv' is accessible and correctly formatted.");
});