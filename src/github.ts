import { paths } from "@octokit/openapi-types";
import { Gist } from "./types";

export async function findAllGist(
  githubPersonalAccessToken: string
): Promise<Gist[]> {
  const { Octokit } = await import("@octokit/core");

  const octokit = new Octokit({
    auth: githubPersonalAccessToken,
  });

  const list: paths["/gists"]["get"]["responses"]["200"]["content"]["application/json"] =
    [];

  async function fetchPage(page: number, perPage: number) {
    const response = await octokit.request(
      `GET /gists?per_page=${perPage}&page=${page}`,
      {
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    list.push(...response.data);

    if (response.data.length === perPage) {
      await fetchPage(page + 1, perPage);
    }
  }

  await fetchPage(1, 100);

  const details: paths["/gists/{gist_id}"]["get"]["responses"]["200"]["content"]["application/json"][] =
    [];

  for (const item of list) {
    const response = await octokit.request(`GET /gists/${item.id}`, {
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    details.push(response.data);
  }

  return (
    await Promise.all(
      details.map(async (detail) => {
        const response = await octokit.request(
          "GET /gists/{gist_id}/comments",
          {
            gist_id: detail.id,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );

        return {
          url: detail.html_url,
          description: detail.description,
          createdAt: detail.created_at,
          updatedAt: detail.updated_at,
          files: Object.entries(detail.files).map(([filename, file]) => ({
            filename,
            content: file.content,
          })),
          comments: response.data.map((commit) => ({
            createdAt: commit.created_at,
            updatedAt: commit.updated_at,
            user: {
              username: commit.user.login,
              avatarUrl: commit.user.avatar_url,
            },
            body: commit.body,
          })),
        };
      })
    )
  ).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
