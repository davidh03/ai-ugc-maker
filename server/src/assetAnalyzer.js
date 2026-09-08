import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const execFileP = promisify(execFile);
const CODEX_BIN = process.env.CODEX_BIN || '/home/clez/.local/bin/codex';
const LUNA_MODEL = 'gpt-5.6-luna';
const TEST_MODE = process.env.NODE_ENV === 'test' || process.argv.includes('--test');

const ROLE_WORDS = { hero: ['hero', 'product', 'bottle', 'pack', 'main'], logo: ['logo', 'brand', 'mark'], person: ['person', 'portrait', 'face', 'creator', 'selfie'], background: ['bg', 'background', 'texture', 'wall'], detail: ['detail', 'close', 'macro'], outro: ['outro', 'end', 'cta', 'call-to-action'] };
function roleFromName(name = '') { const lower = name.toLowerCase(); const match = Object.entries(ROLE_WORDS).find(([, words]) => words.some(word => lower.includes(word))); return match?.[0] || 'supporting'; }
async function probe(filePath) { const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', filePath]); return JSON.parse(stdout); }
async function imageProbe(filePath) { try { const { stdout } = await execFileP('identify', ['-format', '{"format":"%m","width":%w,"height":%h,"colorspace":"%[colorspace]","mean":"%[mean]"}', filePath]); return JSON.parse(stdout); } catch { const media = await probe(filePath); const stream = media.streams?.[0] || {}; return { format: stream.codec_name, width: stream.width, height: stream.height }; } }
function ratioRole(width, height) { if (!width || !height) return 'unknown'; if (height > width * 1.15) return 'vertical'; if (width > height * 1.15) return 'landscape'; return 'square'; }

function runLuna(args) { return new Promise((resolve, reject) => { const child = spawn(CODEX_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `/home/clez/.local/bin:${process.env.PATH || ''}` } }); let stderr = ''; child.stderr.on('data', data => { stderr += data; }); const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Luna analysis timed out')); }, 120000); child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error((stderr || `Codex exited ${code}`).slice(0, 500))); }); }); }

async function analyzeImageWithLuna(filePath, assetId) {
  if (TEST_MODE || process.env.ENABLE_LUNA_IMAGE_ANALYSIS === 'false' || !existsSync(CODEX_BIN)) return null;
  const outputPath = path.join('/tmp', `aiugc-luna-analysis-${assetId || 'asset'}.txt`);
  const prompt = 'Analyze the attached image for a video editor. Return ONLY valid JSON with these keys: description (string), objects (array of strings), visualRole (one of hero, logo, person, background, detail, outro, supporting), recommendedTiming (string), recommendedMotion (string), confidence (number 0 to 1). Do not include markdown fences or extra text.';
  try {
    await runLuna(['exec', '--model', LUNA_MODEL, '--cd', path.dirname(filePath), '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '--image', filePath, '-o', outputPath, prompt]);
    const outputText = await (await import('node:fs/promises')).readFile(outputPath, 'utf8');
    return JSON.parse(outputText.trim());
  } catch { return null; } finally { try { unlinkSync(outputPath); } catch {} }
}

export async function analyzeAsset(asset, dataDir) {
  const filePath = path.join(dataDir, asset.path); const result = { id: asset.id, filename: asset.filename, originalName: asset.originalName, category: asset.category, required: asset.required !== false, analysisMode: 'local-media-metadata', suggestedRole: roleFromName(asset.originalName || asset.filename), errors: [] };
  if (!existsSync(filePath)) return { ...result, errors: ['file missing'] };
  try {
    if (asset.category === 'image') { const image = await imageProbe(filePath); result.format = image.format; result.width = Number(image.width); result.height = Number(image.height); result.orientation = ratioRole(result.width, result.height); result.description = `${result.orientation} image asset${result.originalName ? ` named ${result.originalName}` : ''}`; const vision = await analyzeImageWithLuna(filePath, asset.id); if (vision) { Object.assign(result, { description: vision.description || result.description, objects: Array.isArray(vision.objects) ? vision.objects : [], suggestedRole: vision.visualRole || result.suggestedRole, recommendedTiming: vision.recommendedTiming, recommendedMotion: vision.recommendedMotion, confidence: vision.confidence, analysisMode: `openai-${LUNA_MODEL}-vision` }); } }
    else { const media = await probe(filePath); const stream = media.streams?.find(s => s.codec_type === (asset.category === 'music' ? 'audio' : 'video')) || media.streams?.[0] || {}; result.durationSec = Number(media.format?.duration || 0); result.codec = stream.codec_name; result.width = stream.width; result.height = stream.height; result.orientation = ratioRole(stream.width, stream.height); result.frameRate = stream.r_frame_rate; result.sampleRate = stream.sample_rate; result.channels = stream.channels; result.bitRate = media.format?.bit_rate ? Number(media.format.bit_rate) : undefined; result.description = asset.category === 'music' ? `audio bed${result.durationSec ? `, ${result.durationSec.toFixed(1)} seconds` : ''}` : `${result.orientation} video${result.durationSec ? `, ${result.durationSec.toFixed(1)} seconds` : ''}`; }
  } catch (error) { result.errors.push(String(error.message || error).slice(0, 240)); }
  return result;
}
export async function analyzeAssets(assets = [], dataDir) { return Promise.all(assets.filter(asset => asset?.path).map(asset => analyzeAsset(asset, dataDir))); }
