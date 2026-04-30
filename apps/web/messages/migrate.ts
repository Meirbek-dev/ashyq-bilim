import { readFile, writeFile } from 'node:fs/promises';

const locales = ['kk-KZ', 'ru-RU', 'en-US'];

const mappings = [
  ['Activities.ExamActivity', 'Features.Assessments.Attempt.Exam'],
  ['DashPage.Assignments', 'Features.Assessments.Studio.Assignment'],
  ['Activities.CodeChallenges', 'Features.Assessments.Attempt.CodeChallenge'],
  ['Features.Grading', 'Features.Assessments.Review'],
] as const;

for (const locale of locales) {
  const file = new URL(`${locale}.json`, import.meta.url);
  const messages = JSON.parse(await readFile(file, 'utf8'));

  for (const [from, to] of mappings) {
    const value = getPath(messages, from);
    if (value !== undefined) setPath(messages, to, value);
  }

  await writeFile(file, `${JSON.stringify(messages, null, 2)}\n`);
}

function getPath(source: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((node, part) => {
    if (!node || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[part];
  }, source);
}

function setPath(target: Record<string, unknown>, dottedPath: string, value: unknown) {
  const parts = dottedPath.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}
