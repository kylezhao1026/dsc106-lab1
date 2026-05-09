import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const width = 1000;
const height = 600;
const margin = { top: 24, right: 28, bottom: 52, left: 76 };
const githubRepo = "https://github.com/kylezhao1026/dsc106-lab1";

const statsContainer = d3.select("#stats");
const chart = d3.select("#chart");
const selectionCount = d3.select("#selection-count");
const languageBreakdown = d3.select("#language-breakdown");
const tooltip = d3.select("#commit-tooltip");
const tooltipLink = d3.select("#commit-link");
const tooltipAuthor = d3.select("#commit-author");
const tooltipDate = d3.select("#commit-date");
const tooltipTime = d3.select("#commit-time");
const tooltipLines = d3.select("#commit-lines");

let data = [];
let commits = [];
let selectedCommits = [];

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

function getHoveredCommit(event, svg, xScale, yScale, radiusScale) {
  const [pointerX, pointerY] = d3.pointer(event, svg.node());
  const nearest = d3.least(commits, (commit) => {
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

function renderSelectionCount() {
  if (selectedCommits.length === 0) {
    selectionCount.text("No commits selected");
    renderLanguageBreakdown(commits);
    return;
  }

  const lines = d3.sum(selectedCommits, (d) => d.totalLines);
  selectionCount.text(
    `${selectedCommits.length.toLocaleString("en")} selected commits, ${lines.toLocaleString("en")} lines`,
  );
  renderLanguageBreakdown(selectedCommits);
}

function renderScatterPlot() {
  chart.selectAll("*").remove();

  const svg = chart
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Scatterplot of commits by date and time of day");

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([margin.left, width - margin.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([height - margin.bottom, margin.top]);

  const radiusScale = d3
    .scaleSqrt()
    .domain(d3.extent(commits, (d) => d.totalLines))
    .range([4, 22]);

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

  const dots = svg
    .append("g")
    .attr("class", "dots")
    .selectAll("circle")
    .data(commits, (d) => d.id)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => radiusScale(d.totalLines))
    .attr("class", (d) => (selectedCommits.includes(d) ? "selected" : ""));

  chart.on("mouseleave", () => hideTooltip(dots));
  d3.select(window)
    .on("mousemove.meta-tooltip", (event) => {
      const bounds = svg.node().getBoundingClientRect();
      const isInsideChart =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!isInsideChart) {
        hideTooltip(dots);
      }
    })
    .on("scroll.meta-tooltip", () => hideTooltip(dots));

  const brush = d3
    .brush()
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("brush end", (event) => {
      const selection = event.selection;

      selectedCommits = selection
        ? commits.filter((d) => {
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
      renderSelectionCount();
    });

  svg
    .append("g")
    .attr("class", "brush")
    .call(brush)
    .on("mousemove", (event) => {
      if (event.buttons) {
        hideTooltip(dots);
        return;
      }

      const hoveredCommit = getHoveredCommit(event, svg, xScale, yScale, radiusScale);
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
  selectedCommits = [];

  renderStats();
  renderScatterPlot();
  renderSelectionCount();
} catch (error) {
  console.error("Unable to load meta data.", error);
  chart.html("<p>Unable to load code analysis data.</p>");
}
