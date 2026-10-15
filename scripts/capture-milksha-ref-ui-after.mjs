#!/usr/bin/env node
import { captureFullBoardScreenshot, buildRefLayoutComparisonPayload } from './check-milksha-board-column-alignment.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const ART = '/opt/cursor/artifacts';
const REF = '/opt/cursor/artifacts/milksha-ui-ref-1920x1080.png';
const REF_SRC =
  '/opt/cursor/artifacts/milksha-ui-ref-source-1706x960.jpg';

const payload = buildRefLayoutComparisonPayload();
const { outPath } = await captureFullBoardScreenshot({
  outPath: `${ART}/milksha-ui-comparison-board-1920x1080.png`,
  payload,
});

spawnSync(
  'python3',
  [
    '-c',
    `from PIL import Image; import sys
ref=Image.open(sys.argv[1]).convert('RGB').resize((1920,1080), Image.Resampling.LANCZOS)
our=Image.open(sys.argv[2]).convert('RGB')
side=Image.new('RGB',(3840,1080)); side.paste(ref,(0,0)); side.paste(our,(1920,0)); side.save(sys.argv[3])
import numpy as np
r=np.array(ref).astype('float32'); o=np.array(our).astype('float32')
Image.fromarray(((0.5*r+0.5*o).astype('uint8'))).save(sys.argv[4])`,
    REF_SRC,
    outPath,
    `${ART}/milksha-ui-comparison-side-by-side-3840x1080.png`,
    `${ART}/milksha-ui-comparison-overlay-1920x1080.png`,
  ],
  { stdio: 'inherit' },
);

spawnSync(
  'python3',
  [
    '-c',
    `from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').resize((1920,1080), Image.Resampling.LANCZOS).save(sys.argv[2])`,
    REF_SRC,
    REF,
  ],
  { stdio: 'inherit' },
);
spawnSync('python3', ['/tmp/milksha-ui-ref-measure2.py', REF, `${ART}/milksha-ui-ref-metrics.json`], {
  stdio: 'inherit',
});

console.log(JSON.stringify({ outPath }, null, 2));
