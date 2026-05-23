import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import scrollama from "https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm";

const width = 1000;
const height = 600;
const margin = { top: 24, right: 28, bottom: 52, left: 76 };
const githubRepo = "https://github.com/kylezhao1026/dsc106-lab1";
const colors = d3.scaleOrdinal(d3.schemeTableau10);

const statsContainer = d3.select("#stats");
const chart = d3.select("#chart");
const selectionCount = d3.select("#selection-count");
const languageBreakdown = d3.select("#language-breakdown");
const tooltip = d3.select("#commit-tooltip");
const tooltipLink = d3.select("#commit-link");
const tooltipAuthor = d3.select("#commit-author");
const tooltipDate = d3.select("#commit-date");
const tooltipTime = d3.select("#tooltip-commit-time");
const tooltipLines = d3.select("#commit-lines");
const commitProgressInput = d3.select("#commit-progress");
const commitTime = d3.select("#commit-time");
const scatterStory = d3.select("#scatter-story");
const filesList = d3.select("#files");

let data = [];
let commits = [];
let filteredCommits = [];
let selectedCommits = [];
let commitProgress = 100;
let commitMaxTime;
let timeScale;
let svg;
let dotsGroup;
let brushGroup;
let xScale;
let yScale;
let radiusScale;
let xAxisGroup;

function createTooltipContent(commit) {
  tooltipLink
    .attr("href", commit.url)
    .text(commit.id.slice(0, 7));
  tooltipAuthor.text(commit.author);
  tooltipDate.text(commit.datetime.toLocaleDateString("en", { dateStyle: "medium" }));
  tooltipTime.text(commit.datetime.toLocaleTimeString("en", { timeStyle: "short" }));
  tooltipLines.text(commit.totalLines.toLocaleString("en"));
}

function updateTooltipVisibility(isVisible) {
  tooltip.property("hidden", !isVisible);
}

function updateTooltipPosition(event) {
  tooltip
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`);
}

function hideTooltip(dots) {
  dots?.classed("hovered", false);
  updateTooltipVisibility(false);
}

function getHoveredCommit(event, svg, xScale, yScale, radiusScale, sourceCommits = filteredCommits) {
  const [pointerX, pointerY] = d3.pointer(event, svg.node());
  const nearest = d3.least(sourceCommits, (commit) => {
    const dx = pointerX - xScale(commit.datetime);
    const dy = pointerY - yScale(commit.hourFrac);

    return Math.hypot(dx, dy);
  });

  if (!nearest) {
    return null;
  }

  const distance = Math.hypot(
    pointerX - xScale(nearest.datetime),
    pointerY - yScale(nearest.hourFrac),
  );
  const hitRadius = Math.max(radiusScale(nearest.totalLines) + 10, 18);

  return distance <= hitRadius ? nearest : null;
}

function processCommits(rows) {
  return d3
    .groups(rows, (d) => d.commit)
    .map(([id, lines]) => {
      const first = lines[0];
      const datetime = new Date(first.datetime);
      const commit = {
        id,
        url: `${githubRepo}/commit/${id}`,
        author: first.author,
        datetime,
        date: first.date,
        time: first.time,
        timezone: first.timezone,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(commit, "lines", {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });

      return commit;
    })
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

function renderStats() {
  const files = d3.groups(data, (d) => d.file).length;
  const languages = d3.groups(data, (d) => d.type).length;
  const totalLines = data.length;
  const totalCommits = commits.length;
  const largestCommit = d3.max(commits, (d) => d.totalLines) ?? 0;

  const stats = [
    ["Lines", totalLines],
    ["Files", files],
    ["Languages", languages],
    ["Commits", totalCommits],
    ["Largest commit", largestCommit],
  ];

  statsContainer
    .selectAll("div")
    .data(stats)
    .join("div")
    .html(([label, value]) => `<dt>${label}</dt><dd>${value.toLocaleString("en")}</dd>`);
}

function renderLanguageBreakdown(sourceCommits = commits) {
  const selectedLines = sourceCommits.flatMap((commit) => commit.lines);
  const linesByLanguage = d3.rollups(
    selectedLines,
    (v) => v.length,
    (d) => d.type,
  ).sort((a, b) => d3.descending(a[1], b[1]));

  languageBreakdown
    .selectAll("div")
    .data(linesByLanguage, ([language]) => language)
    .join("div")
    .html(([language, lines]) => `<dt>${language}</dt><dd>${lines.toLocaleString("en")}</dd>`);
}

function renderSelectionCount(sourceCommits = filteredCommits) {
  if (selectedCommits.length === 0) {
    selectionCount.text("No commits selected");
    renderLanguageBreakdown(sourceCommits);
    return;
  }

  const lines = d3.sum(selectedCommits, (d) => d.totalLines);
  selectionCount.text(
    `${selectedCommits.length.toLocaleString("en")} selected commits, ${lines.toLocaleString("en")} lines`,
  );
  renderLanguageBreakdown(selectedCommits);
}

function makeChartScales(sourceCommits) {
  const xDomainSource = sourceCommits.length > 1 ? sourceCommits : commits;
  const radiusExtent = d3.extent(sourceCommits, (d) => d.totalLines);
  const maxRadius = radiusExtent[1] ?? 1;

  xScale = d3
    .scaleTime()
    .domain(d3.extent(xDomainSource, (d) => d.datetime))
    .range([margin.left, width - margin.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([height - margin.bottom, margin.top]);

  radiusScale = d3
    .scaleSqrt()
    .domain([radiusExtent[0] ?? 0, maxRadius])
    .range([4, 22]);
}

function renderScatterPlot() {
  chart.selectAll("*").remove();

  svg = chart
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Scatterplot of commits by date and time of day");

  makeChartScales(filteredCommits);

  const xAxis = d3.axisBottom(xScale).ticks(width / 120).tickSizeOuter(0);
  const yAxis = d3
    .axisLeft(yScale)
    .tickValues([0, 6, 12, 18, 24])
    .tickFormat((d) => {
      const hour = d === 24 ? 0 : d;
      return new Date(2000, 0, 1, hour).toLocaleTimeString("en", {
        hour: "numeric",
      });
    });

  svg
    .append("g")
    .attr("class", "gridlines")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).tickSize(-(width - margin.left - margin.right)).tickFormat(""));

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis);

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height - 12)
    .attr("text-anchor", "middle")
    .text("Commit date");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .text("Time of day");

  xAxisGroup = svg.select("g.x-axis");
  dotsGroup = svg
    .append("g")
    .attr("class", "dots");

  brushGroup = svg
    .append("g")
    .attr("class", "brush");

  chart.on("mouseleave", () => hideTooltip(dotsGroup.selectAll("circle")));
  d3.select(window)
    .on("mousemove.meta-tooltip", (event) => {
      const bounds = svg.node().getBoundingClientRect();
      const isInsideChart =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!isInsideChart) {
        hideTooltip(dotsGroup.selectAll("circle"));
      }
    })
    .on("scroll.meta-tooltip", () => hideTooltip(dotsGroup.selectAll("circle")));

  updateScatterPlot(filteredCommits);
}

function updateScatterPlot(sourceCommits) {
  makeChartScales(sourceCommits);

  const xAxis = d3.axisBottom(xScale).ticks(width / 120).tickSizeOuter(0);
  xAxisGroup.selectAll("*").remove();
  xAxisGroup.call(xAxis);

  const sortedCommits = d3.sort(sourceCommits, (d) => -d.totalLines);
  const dots = dotsGroup
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => radiusScale(d.totalLines))
    .style("--r", (d) => radiusScale(d.totalLines))
    .attr("class", (d) => (selectedCommits.includes(d) ? "selected" : ""));

  const brush = d3
    .brush()
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("brush end", (event) => {
      const selection = event.selection;

      selectedCommits = selection
        ? sourceCommits.filter((d) => {
            const x = xScale(d.datetime);
            const y = yScale(d.hourFrac);

            return (
              x >= selection[0][0] &&
              x <= selection[1][0] &&
              y >= selection[0][1] &&
              y <= selection[1][1]
            );
          })
        : [];

      dots.classed("selected", (d) => selectedCommits.includes(d));
      renderSelectionCount(sourceCommits);
    });

  brushGroup
    .call(brush)
    .on("mousemove", (event) => {
      if (event.buttons) {
        hideTooltip(dots);
        return;
      }

      const hoveredCommit = getHoveredCommit(event, svg, xScale, yScale, radiusScale, sourceCommits);
      dots.classed("hovered", (d) => d === hoveredCommit);

      if (hoveredCommit) {
        createTooltipContent(hoveredCommit);
        updateTooltipPosition(event);
        updateTooltipVisibility(true);
      } else {
        hideTooltip(dots);
      }
    })
    .on("mouseleave", () => hideTooltip(dots))
    .on("mouseout", (event) => {
      const relatedTarget = event.relatedTarget;

      if (!relatedTarget || !svg.node().contains(relatedTarget)) {
        hideTooltip(dots);
      }
    });
}

function updateFileDisplay(sourceCommits) {
  const lines = sourceCommits.flatMap((commit) => commit.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, fileLines]) => ({ name, lines: fileLines }))
    .sort((a, b) => d3.descending(a.lines.length, b.lines.length));

  const fileRows = filesList
    .selectAll("div")
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append("div").call((div) => {
        div.append("dt");
        div.append("dd");
      }),
    );

  fileRows
    .select("dt")
    .html(
      (d) =>
        `<code>${d.name}</code><small>${d.lines.length.toLocaleString("en")} lines</small>`,
    );

  fileRows
    .select("dd")
    .selectAll("div")
    .data((d) => d.lines)
    .join("div")
    .attr("class", "loc")
    .style("--color", (d) => colors(d.type));
}

function setCommitMaxTime(maxTime) {
  commitMaxTime = maxTime;
  commitProgress = timeScale(commitMaxTime);
  filteredCommits = commits.filter((commit) => commit.datetime <= commitMaxTime);
  selectedCommits = [];

  commitProgressInput.property("value", commitProgress);
  commitTime
    .attr("datetime", commitMaxTime.toISOString())
    .text(
      commitMaxTime.toLocaleString("en", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    );

  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
  renderSelectionCount(filteredCommits);
}

function onTimeSliderChange(event) {
  commitProgress = Number(event.currentTarget.value);
  setCommitMaxTime(timeScale.invert(commitProgress));
}

function renderCommitStory() {
  scatterStory
    .selectAll(".step")
    .data(commits, (d) => d.id)
    .join("div")
    .attr("class", "step")
    .html(
      (d, i) => `
        <p>On ${d.datetime.toLocaleString("en", {
          dateStyle: "full",
          timeStyle: "short",
        })}, I made <a href="${d.url}" target="_blank" rel="noopener">${
          i > 0 ? "another commit" : "my first commit"
        }</a>.</p>
        <p>I edited ${d.totalLines.toLocaleString("en")} lines across ${d3
          .rollups(
            d.lines,
            (lines) => lines.length,
            (line) => line.file,
          )
          .length.toLocaleString("en")} files.</p>
      `,
    );
}

function setupScrollytelling() {
  const scroller = scrollama();

  scroller
    .setup({
      container: "#scrolly-1",
      step: "#scrolly-1 .step",
      offset: 0.5,
    })
    .onStepEnter((response) => {
      const commit = response.element.__data__;
      scatterStory.selectAll(".step").classed("active", (d) => d === commit);
      setCommitMaxTime(commit.datetime);
    });

  d3.select(window).on("resize.scrolly", () => scroller.resize());
}

try {
  data = await d3.csv("./loc.csv", (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date),
    datetime: new Date(row.datetime),
  }));

  commits = processCommits(data);
  filteredCommits = commits;
  selectedCommits = [];
  timeScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([0, 100]);
  commitMaxTime = timeScale.invert(commitProgress);

  renderStats();
  renderScatterPlot();
  renderCommitStory();
  setupScrollytelling();
  setCommitMaxTime(commitMaxTime);
  commitProgressInput.on("input", onTimeSliderChange);
} catch (error) {
  console.error("Unable to load meta data.", error);
  chart.html("<p>Unable to load code analysis data.</p>");
}
