#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHypothesis0Markdown } from './hypothesis0-cycle-table.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)));
const tablePath = join(ART, 'hypothesis0-cycle-table.json');
const mdPath = join(ART, 'HYPOTHESES.md');

const rows = JSON.parse(readFileSync(tablePath, 'utf8'));
const block = renderHypothesis0Markdown(rows, readFileSync(join(ART, 'real-cloud-red-result.json'), 'utf8').slice(0, 80));
let body = readFileSync(mdPath, 'utf8');
body = body.replace(/^## Hypothesis 0[\s\S]*?(?=^## |\n# Cross-zone)/m, '');
writeFileSync(mdPath, `${block}\n\n---\n\n${body.replace(/^# Cross-zone/m, '# Cross-zone')}`);
