import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";

const WORKING_DIRECTORY = process.cwd();

export function rm(path: string): void {
  if (existsSync(join(WORKING_DIRECTORY, path))) {
    rmSync(join(WORKING_DIRECTORY, path), { recursive: true });
  }
}

export function mkdir(path: string): void {
  if (existsSync(join(WORKING_DIRECTORY, path))) {
    return;
  }
  mkdirSync(join(WORKING_DIRECTORY, path));
}

export function ls(path: string): string[] {
  if (!existsSync(join(WORKING_DIRECTORY, path))) {
    return [];
  }
  return readdirSync(join(WORKING_DIRECTORY, path));
}

export function cat(path: string): string {
  return readFileSync(join(WORKING_DIRECTORY, path), "utf-8");
}

export function cp(source: string, destination: string): void {
  copyFileSync(
    join(WORKING_DIRECTORY, source),
    join(WORKING_DIRECTORY, destination)
  );
}

export function put(path: string, content: string): void {
  writeFileSync(join(WORKING_DIRECTORY, path), content);
}
