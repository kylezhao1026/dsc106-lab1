import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { fetchJSON, renderProjects } from "../global.js";

const projectsContainer = document.querySelector(".projects");
const projectsTitle = document.querySelector(".projects-title");
const searchInput = document.querySelector(".searchBar");
const svg = d3.select("#projects-pie-plot");
const legend = d3.select(".legend");

let projects = [];
let query = "";
let selectedYear = null;
let pieData = [];
const colors = d3.scaleOrdinal(d3.schemeTableau10);

function filterProjects() {
  let filteredProjects = projects;

  if (query) {
    filteredProjects = filteredProjects.filter((project) => {
      const values = Object.values(project).join("\n").toLowerCase();
      return values.includes(query.toLowerCase());
    });
  }

  if (selectedYear) {
    filteredProjects = filteredProjects.filter(
      (project) => String(project.year) === selectedYear,
    );
  }

  return filteredProjects;
}

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => String(d.year),
  );

  pieData = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(pieData);
  const arcs = arcData.map((d) => arcGenerator(d));

  svg.selectAll("path").remove();
  legend.selectAll("li").remove();

  arcs.forEach((arc, i) => {
    svg
      .append("path")
      .attr("d", arc)
      .attr("fill", colors(i))
      .attr("class", pieData[i].label === selectedYear ? "selected" : "")
      .on("click", () => {
        selectedYear = selectedYear === pieData[i].label ? null : pieData[i].label;
        updatePage();
      });
  });

  pieData.forEach((d, i) => {
    legend
      .append("li")
      .attr("style", `--color:${colors(i)}`)
      .attr(
        "class",
        d.label === selectedYear ? "legend-item selected" : "legend-item",
      )
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on("click", () => {
        selectedYear = selectedYear === d.label ? null : d.label;
        updatePage();
      });
  });
}

function updatePage() {
  const filteredProjects = filterProjects();
  const searchedProjects = query
    ? projects.filter((project) => {
        const values = Object.values(project).join("\n").toLowerCase();
        return values.includes(query.toLowerCase());
      })
    : projects;

  if (projectsTitle) {
    projectsTitle.textContent = `${filteredProjects.length} Projects`;
  }

  renderProjects(filteredProjects, projectsContainer, "h2");
  renderPieChart(searchedProjects);
}

try {
  projects = await fetchJSON("../lib/projects.json");
  updatePage();

  searchInput?.addEventListener("input", (event) => {
    query = event.target.value;
    updatePage();
  });
} catch (error) {
  console.error("Unable to load project data.", error);

  if (projectsTitle) {
    projectsTitle.textContent = "Projects";
  }

  if (projectsContainer) {
    projectsContainer.innerHTML = "<p>Unable to load projects right now.</p>";
  }
}
