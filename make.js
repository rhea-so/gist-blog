#!/usr/bin/env node

const fs = require("fs").promises;
const path = require("path");
const https = require("https");
const marked = require("marked");
const highlight = require("highlight.js");
const { Feed } = require("feed");
const mustache = require("mustache");
const crypto = require("crypto");

// 환경 변수에서 GitHub 토큰 가져오기
const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("GITHUB_PERSONAL_ACCESS_TOKEN 환경변수를 설정해주세요");
  process.exit(1);
}

// 날짜 형식을 YYYY-MM-DD로 변환하는 함수
function formatDateToYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// config.json에서 설정 불러오기
async function loadConfig() {
  try {
    const configFile = await fs.readFile("./config.json", "utf-8");
    return JSON.parse(configFile);
  } catch (error) {
    console.error("config.json 파일을 불러올 수 없습니다:", error.message);
    process.exit(1);
  }
}

// 마크다운 설정
marked.setOptions({
  renderer: new marked.Renderer(),
  highlight: function (code, language) {
    const validLanguage = highlight.getLanguage(language)
      ? language
      : "plaintext";
    return highlight.highlight(validLanguage, code).value;
  },
  pedantic: false,
  gfm: true,
  breaks: true,
  sanitize: false,
  smartLists: true,
  smartypants: false,
  xhtml: false,
  headerIds: false, // 헤더 ID 자동 생성 비활성화
});

// 깨진 유니코드 문자 복구하는 함수
function fixBrokenUnicode(text) {
  // 깨진 한글 패턴을 수정합니다
  return text
    .replace(/�/g, "") // 깨진 문자 제거
    .replace(/&#x([0-9a-f]+);/gi, function (match, hex) {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch (e) {
        return match;
      }
    });
}

// API 호출 함수
async function fetchFromGitHub(endpoint, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: endpoint,
      headers: {
        "User-Agent": "Gist-Blog-Generator",
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        ...customHeaders,
      },
    };

    const req = https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${e.message}`));
          }
        } else {
          reject(new Error(`GitHub API 오류: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// 템플릿 렌더링 함수
async function renderTemplate(templateName, data, config) {
  const templatePath = path.join(config.templatesDir, `${templateName}.html`);
  const template = await fs.readFile(templatePath, "utf-8");
  return mustache.render(template, data);
}

// Gist 목록 가져오기
async function getGists(config) {
  // username이 비어있으면 사용자 정보를 가져와 설정
  if (!config.username) {
    const userInfo = await fetchFromGitHub("/user");
    config.username = userInfo.login;

    // config.json 업데이트
    const configPath = "./config.json";
    const configData = JSON.parse(await fs.readFile(configPath, "utf-8"));
    configData.username = config.username;
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
  }

  // 페이지네이션을 통해 모든 Gist 가져오기
  let page = 1;
  let allGists = [];
  let hasMore = true;

  while (hasMore) {
    const gists = await fetchFromGitHub(
      `/users/${config.username}/gists?page=${page}&per_page=100`
    );
    if (gists.length === 0) {
      hasMore = false;
    } else {
      allGists = [...allGists, ...gists];
      page++;
    }
  }

  // 모든 Gist를 블로그 포스트로 처리 (blog 태그 검사 없이)
  const blogPosts = allGists
    .filter((gist) => gist.description && Object.keys(gist.files).length > 0)
    .map((gist) => {
      const fileName = Object.keys(gist.files)[0];
      const file = gist.files[fileName];
      // [blog] 태그가 있으면 제거, 없으면 그냥 설명 사용
      const title = gist.description.replace(/\[blog\]/i, "").trim();

      return {
        id: gist.id,
        title: title,
        description: title,
        createdAt: new Date(gist.created_at),
        updatedAt: new Date(gist.updated_at),
        url: `/post/${gist.id}.html`,
        fileName: fileName,
        language: file.language,
        raw_url: file.raw_url,
        comments_url: `${gist.comments_url}`,
        gist_url: `https://gist.github.com/${config.username}/${gist.id}`,
      };
    });

  // 날짜 내림차순 정렬
  return blogPosts.sort((a, b) => b.createdAt - a.createdAt);
}

// Gist 내용 및 댓글 가져오기
async function getGistContent(post) {
  // Gist 내용 가져오기
  return new Promise((resolve, reject) => {
    https
      .get(post.raw_url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", async () => {
          // 댓글 가져오기
          try {
            const comments = await fetchFromGitHub(
              `/gists/${post.id}/comments`
            );

            const formattedComments = comments.map((comment) => ({
              id: comment.id,
              user: {
                login: comment.user.login,
                avatar_url: comment.user.avatar_url,
                html_url: comment.user.html_url,
              },
              created_at: formatDateToYYYYMMDD(new Date(comment.created_at)),
              updated_at: formatDateToYYYYMMDD(new Date(comment.updated_at)),
              body: marked.parse(fixBrokenUnicode(comment.body)),
              html_url: comment.html_url,
            }));

            // 마크다운 변환 전 깨진 유니코드 수정
            const fixedData = fixBrokenUnicode(data);

            // 마크다운에서 첫 번째 이미지 URL 추출
            const parsedHTML = marked.parse(fixedData);
            let firstImage = null;
            const imgRegex = /<img[^>]+src="([^">]+)"/;
            const imgMatch = parsedHTML.match(imgRegex);
            if (imgMatch && imgMatch[1]) {
              firstImage = imgMatch[1];
            }

            resolve({
              content: fixedData,
              html: parsedHTML,
              comments: formattedComments,
              comments_count: comments.length,
              firstImage: firstImage,
            });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

// 파일 생성 함수
async function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}

// RSS 피드 생성
async function generateRSSFeed(posts, config) {
  const feed = new Feed({
    title: config.title,
    description: config.description,
    id: config.url,
    link: config.url,
    language: "ko",
    favicon: `${config.url}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}, ${
      config.username
    }`,
    updated: posts.length > 0 ? posts[0].updatedAt : new Date(),
    author: {
      name: config.username,
      link: `https://github.com/${config.username}`,
    },
  });

  for (const post of posts) {
    const content = await getGistContent(post);
    feed.addItem({
      title: post.title,
      id: `${config.url}${post.url}`,
      link: `${config.url}${post.url}`,
      description: post.description,
      content: content.html,
      author: [
        {
          name: config.username,
          link: `https://github.com/${config.username}`,
        },
      ],
      date: post.updatedAt,
    });
  }

  await writeFile(path.join(config.outputDir, "rss.xml"), feed.rss2());
  await writeFile(path.join(config.outputDir, "atom.xml"), feed.atom1());
}

// sitemap.xml 생성
async function generateSitemap(posts, config) {
  const now = new Date().toISOString();
  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // 메인 페이지
  sitemap += `  <url>\n`;
  sitemap += `    <loc>${config.url}/</loc>\n`;
  sitemap += `    <lastmod>${now}</lastmod>\n`;
  sitemap += `    <priority>1.0</priority>\n`;
  sitemap += `  </url>\n`;

  // 페이지네이션 페이지
  const pageCount = Math.ceil(posts.length / config.postsPerPage);
  for (let i = 2; i <= pageCount; i++) {
    sitemap += `  <url>\n`;
    sitemap += `    <loc>${config.url}/page/${i}.html</loc>\n`;
    sitemap += `    <lastmod>${now}</lastmod>\n`;
    sitemap += `    <priority>0.8</priority>\n`;
    sitemap += `  </url>\n`;
  }

  // 포스트 페이지
  for (const post of posts) {
    sitemap += `  <url>\n`;
    sitemap += `    <loc>${config.url}${post.url}</loc>\n`;
    sitemap += `    <lastmod>${post.updatedAt.toISOString()}</lastmod>\n`;
    sitemap += `    <priority>0.8</priority>\n`;
    sitemap += `  </url>\n`;
  }

  sitemap += "</urlset>";

  await writeFile(path.join(config.outputDir, "sitemap.xml"), sitemap);
  console.log("sitemap.xml이 생성되었습니다.");
}

// 정적 파일 복사
async function copyStaticFiles(config) {
  try {
    const files = await fs.readdir(config.staticDir);
    for (const file of files) {
      const srcPath = path.join(config.staticDir, file);
      const destPath = path.join(config.outputDir, file);

      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        const subFiles = await fs.readdir(srcPath);
        for (const subFile of subFiles) {
          const subSrcPath = path.join(srcPath, subFile);
          const subDestPath = path.join(destPath, subFile);
          await fs.copyFile(subSrcPath, subDestPath);
        }
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error("정적 파일 복사 중 오류:", error);
  }
}

// 블로그 생성
async function generateBlog() {
  try {
    console.log("블로그 생성을 시작합니다...");

    // 설정 불러오기
    const config = await loadConfig();

    // 출력 디렉토리 생성
    await fs.mkdir(config.outputDir, { recursive: true });
    await fs.mkdir(path.join(config.outputDir, "page"), { recursive: true });
    await fs.mkdir(path.join(config.outputDir, "post"), { recursive: true });

    // Gist 목록 가져오기
    const posts = await getGists(config);
    console.log(`${posts.length}개의 블로그 포스트를 찾았습니다.`);

    // 메인 페이지 (인덱스) 생성
    const pageCount = Math.ceil(posts.length / config.postsPerPage);

    for (let i = 0; i < pageCount; i++) {
      const pageNum = i + 1;
      const start = i * config.postsPerPage;
      const end = start + config.postsPerPage;
      const pagePosts = posts.slice(start, end);

      // 포스트 요약 생성
      const postsWithSummary = await Promise.all(
        pagePosts.map(async (post, index) => {
          const content = await getGistContent(post);
          // 내용의 일부분만 요약으로 사용
          const summary = content.html.substring(0, 300) + "...";

          // 게시글 번호 계산 - posts 배열의 전체 길이에서 현재 페이지 시작 인덱스와 현재 포스트 인덱스를 더해 뺍니다
          // 가장 오래된 글이 1번이 되도록 합니다
          const postNumber = posts.length - (start + index);

          return {
            ...post,
            summary,
            firstImage: content.firstImage,
            formattedDate: formatDateToYYYYMMDD(post.createdAt),
            comments_count: content.comments_count,
            postNumber: postNumber,
          };
        })
      );

      // 페이지네이션 정보
      const pagination = {
        current: pageNum,
        total: pageCount,
        hasNext: pageNum < pageCount,
        hasPrev: pageNum > 1,
        nextPage: pageNum < pageCount ? `/page/${pageNum + 1}.html` : null,
        prevPage:
          pageNum > 1
            ? pageNum === 2
              ? "/index.html"
              : `/page/${pageNum - 1}.html`
            : null,
      };

      // 템플릿 렌더링
      const html = await renderTemplate(
        "index",
        {
          config,
          posts: postsWithSummary,
          pagination,
          isHomePage: pageNum === 1,
        },
        config
      );

      // 파일 저장
      if (pageNum === 1) {
        await writeFile(path.join(config.outputDir, "index.html"), html);
      }
      await writeFile(
        path.join(config.outputDir, "page", `${pageNum}.html`),
        html
      );
    }

    // 포스트 페이지 생성
    for (const post of posts) {
      const content = await getGistContent(post);

      // 템플릿 렌더링
      const html = await renderTemplate(
        "post",
        {
          config,
          post: {
            ...post,
            content: content.html,
            formattedDate: formatDateToYYYYMMDD(post.createdAt),
            comments: content.comments,
            comments_count: content.comments_count,
          },
        },
        config
      );

      // 파일 저장
      await writeFile(
        path.join(config.outputDir, "post", `${post.id}.html`),
        html
      );
    }

    // RSS 피드와 사이트맵 생성
    await generateRSSFeed(posts, config);
    await generateSitemap(posts, config);

    // 정적 파일 복사
    await copyStaticFiles(config);

    console.log("블로그 생성이 완료되었습니다.");
    console.log(`출력 디렉토리: ${path.resolve(config.outputDir)}`);
  } catch (error) {
    console.error("블로그 생성 중 오류가 발생했습니다:", error);
    process.exit(1);
  }
}

// 프로그램 실행
generateBlog();
