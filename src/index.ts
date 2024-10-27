import { dateToYYYYMMDD, dateToYYYYMMDDHHMMSS } from "./date";
import { cat, cp, ls, mkdir, put, rm } from "./file-system";
import { findAllGist } from "./github";
import { minifyHTML } from "./html";
import { convertMarkdownToHTML } from "./markdown";

const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const HOSTNAME = process.env.HOSTNAME;

async function main() {
  const gists = await findAllGist(GITHUB_PERSONAL_ACCESS_TOKEN);

  rm("build");
  mkdir("build");

  const indexLayout = cat("layouts/index.html");

  put(
    "build/index.html",
    minifyHTML(
      indexLayout.replace(
        "<!-- INDEX -->",
        gists
          .map(
            (gist) =>
              `<li>${dateToYYYYMMDD(gist.createdAt)} <a href="/${
                gist.description
              }.html">${gist.description}</a></li>`
          )
          .join("")
      )
    )
  );

  const postLayout = cat("layouts/post.html");

  gists.forEach((gist) => {
    put(
      `build/${gist.description}.html`,
      minifyHTML(
        postLayout.replace("<!-- TITLE -->", gist.description).replace(
          "<!-- BODY -->",
          `
          ${gist.files
            .map(
              (file) => `
              <div class="card">
                <div class="card-header">
                  <strong>${file.filename}</strong>
                  <div class="button" onClick="javascript:window.location.href='${
                    gist.url
                  }/edit';
                  ">Edit</div>
                </div>

                <div class="card-content">
                  ${convertMarkdownToHTML(file.content)}
                </div>
              </div>`
            )
            .join("")}

          ${gist.comments
            .map(
              (comment) => `
              <div class="card">
                <div class="card-header">
                  <strong><a href="https://github.com/${
                    comment.user.username
                  }">${
                comment.user.username
              }</a></strong>&nbsp;commented at ${dateToYYYYMMDDHHMMSS(
                comment.createdAt
              )}
                </div>

                <div class="card-content">
                  ${convertMarkdownToHTML(comment.body)}
                </div>
              </div>`
            )
            .join("")}

            <div class="button" onClick="javascript:window.location.href='${
              gist.url
            }';
            ">Open in GitHub Gist</div>

            <div style="margin-top: 10px;" class="button" onClick="javascript:window.location.href='/';
            ">Back to Home</div>
          `
        )
      )
    );
  });

  ls("assets").forEach((path) => {
    cp(`assets/${path}`, `build/${path}`);
  });

  put(
    "build/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${gists
      .map(
        (gist) =>
          `<url><loc>${encodeURI(
            `https://${HOSTNAME}/${gist.description}.html`
          )}</loc><lastmod>${gist.updatedAt}</lastmod></url>`
      )
      .join("")}</urlset>`
  );
}

main().catch(console.error);
