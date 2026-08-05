export const REPO_URL = 'https://github.com/DeanKuhn/music-growth-pipeline';

export function repoFile(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}
