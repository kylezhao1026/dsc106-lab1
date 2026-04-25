import { fetchJSON, fetchGitHubData, renderProjects } from "./global.js";

const projectsContainer = document.querySelector(".projects");
const profileStats = document.querySelector("#profile-stats");

try {
  const projects = await fetchJSON("./lib/projects.json");
  const latestProjects = projects.slice(0, 3);

  renderProjects(latestProjects, projectsContainer, "h2");
} catch (error) {
  console.error("Unable to load homepage projects.", error);

  if (projectsContainer) {
    projectsContainer.innerHTML = "<p>Unable to load projects right now.</p>";
  }
}

try {
  const githubData = await fetchGitHubData("kylezhao1026");

  if (profileStats) {
    profileStats.innerHTML = `
      <dl>
        <dt>Public Repos</dt><dd>${githubData.public_repos}</dd>
        <dt>Public Gists</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers</dt><dd>${githubData.followers}</dd>
        <dt>Following</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  }
} catch (error) {
  console.error("Unable to load GitHub profile data.", error);

  if (profileStats) {
    profileStats.innerHTML = "<p>Unable to load GitHub profile stats right now.</p>";
  }
}
