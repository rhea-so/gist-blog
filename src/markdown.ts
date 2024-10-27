import { Converter } from "showdown";

const markdownConverter = new Converter({
  noHeaderId: true,
  simplifiedAutoLink: true,
  parseImgDimensions: true,
  tables: true,
});

export function convertMarkdownToHTML(markdown: string): string {
  return markdownConverter.makeHtml(markdown);
}
