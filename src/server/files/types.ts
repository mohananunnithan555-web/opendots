export interface FileInfo {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: number;
  extension: string;
}

export interface ReadFileResult {
  name: string;
  relativePath: string;
  content: string;
  size: number;
  truncated?: boolean;
}

export interface WriteFileResult {
  name: string;
  relativePath: string;
  size: number;
  writtenAt: number;
}
