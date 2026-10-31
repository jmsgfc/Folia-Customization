import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const originalRoot = path.resolve('.codex-tasks/kugou-ai-segmentation');
const rootOptionIndex = process.argv.indexOf('--root');
const root = rootOptionIndex < 0 ? originalRoot : path.resolve(process.argv[rootOptionIndex + 1]);
const manifestPath = path.join(root, 'manifest.json');
const cdpPort = Number(process.env.FOLIA_CDP_PORT || 9222);

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const readJsonIfExists = async file => {
  try {
    return await readJson(file);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
};
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const formatLrcTimestamp = milliseconds => {
  const safeMs = Math.max(0, Math.round(Number(milliseconds) || 0));
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}]`;
};

const safeFilenamePart = value => String(value || '')
  .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')
  .replace(/[. ]+$/gu, '')
  .trim();

const findFoliaTarget = async () => {
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && item.title === 'Folia');
  if (!target?.webSocketDebuggerUrl) throw new Error('Folia CDP target not found');
  return target;
};

const evaluate = async expression => {
  const target = await findFoliaTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP evaluation timed out'));
    }, 180_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text || 'CDP evaluation failed'));
        return;
      }
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')));
  });
};

const requestFolia = async payload => {
  const expression = `new Promise((resolve,reject)=>{\n`
    + `const id="codex-seg-"+Date.now()+Math.random();\n`
    + `const timer=setTimeout(()=>{window.removeEventListener("message",on);reject(new Error("Folia bridge timeout"))},150000);\n`
    + `function on(event){const data=event.data;if(event.source===window&&data&&data.source==="folia-extension-bridge"&&data.type==="FOLIA_API_RESPONSE"&&data.id===id){clearTimeout(timer);window.removeEventListener("message",on);data.ok?resolve(data.data):reject(new Error(data.error||"Folia bridge error"))}}\n`
    + `window.addEventListener("message",on);\n`
    + `window.postMessage({source:"folia-web-page",type:"FOLIA_API_REQUEST",id,payload:${JSON.stringify(payload)}},"*");\n`
    + `})`;
  return await evaluate(expression);
};

const existingSegmentationKeys = async () => await evaluate(`(async()=>{\n`
  + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
  + `const keys=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").getAllKeys();request.onsuccess=()=>resolve(request.result.map(String).filter(key=>key.startsWith("lyricSeg_")));request.onerror=()=>reject(request.error)});\n`
  + `db.close();return keys;\n`
  + `})()`);

const songKeyOf = song => `online:kugou:${song.id}`;

// Read the liked collection through Folia's existing provider bridge.
const getLikedSongs = async () => {
  const playlists = await requestFolia({ provider: 'kugou', operation: 'user_playlist', params: { pagesize: 100 } });
  const lists = playlists?.data?.lists || [];
  const liked = lists.find(item => String(item.listid ?? item.list_id) === '2')
    || lists.find(item => ['我喜欢', '我喜欢的音乐'].includes(String(item.name ?? item.listname)));
  if (!liked) throw new Error('KuGou liked playlist not found');

  const listId = String(liked.global_collection_id ?? liked.listid ?? liked.list_id);
  const response = await requestFolia({
    provider: 'kugou',
    operation: 'playlist_track_all',
    params: { id: listId, global_collection_id: listId },
  });
  return response?.data?.songs || [];
};

const init = async () => {
  if (await readJsonIfExists(manifestPath)) throw new Error(`Manifest already exists: ${manifestPath}`);
  const rawSongs = await getLikedSongs();
  if (rawSongs.length < 100) throw new Error(`Liked playlist returned only ${rawSongs.length} songs`);

  // Keep the same client order as kugouProvider.getKugouPlaylistTrackSongs().
  const latest = rawSongs.slice().reverse().slice(0, 100);
  const completed = new Set(await existingSegmentationKeys());
  const songs = latest.map((song, index) => {
    const songKey = songKeyOf(song);
    return {
      rank: index + 1,
      songKey,
      id: song.id,
      hash: song.hash || song.id,
      albumId: song.albumId ?? '',
      albumAudioId: song.albumAudioId ?? '',
      name: song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      durationMs: Number(song.duration || 0),
      status: completed.has(`lyricSeg_${songKey}`) ? 'done-existing' : 'pending',
      attempts: 0,
    };
  });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    playlistCountAtStart: rawSongs.length,
    order: 'kugou-provider-client-order-newest-first',
    targetCount: songs.length,
    batchSize: 5,
    songs,
  };
  await writeJson(manifestPath, manifest);
  console.log(`Saved ${songs.length} songs to ${manifestPath}`);
};

// Combine every completed 100-song manifest so the next batch is anchored after the actual last rank.
const readHistory = async () => {
  const manifestFiles = [path.join(originalRoot, 'manifest.json')];
  for (const entry of await readdir(originalRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) manifestFiles.push(path.join(originalRoot, entry.name, 'manifest.json'));
  }
  const manifests = [];
  for (const file of manifestFiles) {
    if (path.resolve(file) === manifestPath) continue;
    const manifest = await readJsonIfExists(file);
    if (!manifest?.songs?.length) continue;
    const startRank = Number(manifest.startRank || manifest.songs[0]?.rank || 1);
    const finalStatuses = manifest.songs.every(song => ['done', 'no-lyrics'].includes(song.status));
    const contiguous = manifest.songs.every((song, index) => song.rank === startRank + index);
    if (manifest.targetCount !== 100 || manifest.songs.length !== 100 || !finalStatuses || !contiguous) {
      throw new Error(`History manifest is incomplete or invalid: ${file}`);
    }
    manifests.push(manifest);
  }
  const songsByRank = new Map();
  for (const manifest of manifests) {
    for (const song of manifest.songs) {
      const existing = songsByRank.get(song.rank);
      if (existing && String(existing.id).toLowerCase() !== String(song.id).toLowerCase()) {
        throw new Error(`Conflicting history at rank ${song.rank}`);
      }
      songsByRank.set(song.rank, song);
    }
  }
  const songs = Array.from(songsByRank.values()).sort((left, right) => left.rank - right.rank);
  if (!songs.length || songs.some((song, index) => song.rank !== index + 1)) {
    throw new Error('Segmentation history is not contiguous from rank 1');
  }
  return songs;
};

const nextSnapshot = async () => {
  const history = await readHistory();
  const anchor = history.at(-1);
  if (!anchor) throw new Error('Segmentation history is empty');
  const rawSongs = await getLikedSongs();
  const newestFirst = rawSongs.slice().reverse();
  const anchorIndex = newestFirst.findIndex(song => String(song.id).toLowerCase() === String(anchor.id).toLowerCase());
  if (anchorIndex < 0) throw new Error(`Previous rank-${anchor.rank} anchor is no longer in the liked playlist`);
  const next = newestFirst.slice(anchorIndex + 1, anchorIndex + 101);
  if (next.length !== 100) throw new Error(`Only ${next.length} songs remain after the rank-${anchor.rank} anchor`);
  const previousIds = new Set(history.map(song => String(song.id).toLowerCase()));
  const duplicates = next.filter(song => previousIds.has(String(song.id).toLowerCase()));
  if (duplicates.length) throw new Error(`${duplicates.length} songs after the anchor overlap the saved history`);
  const beforeAnchor = newestFirst.slice(0, anchorIndex + 1)
    .filter(song => previousIds.has(String(song.id).toLowerCase()))
    .map(song => String(song.id).toLowerCase());
  const previousOrder = history.map(song => String(song.id).toLowerCase());
  const orderUnchanged = JSON.stringify(beforeAnchor) === JSON.stringify(previousOrder);
  return { rawSongs, next, anchor, anchorIndex, orderUnchanged, historyCount: history.length };
};

const initNext = async ({ preview = false } = {}) => {
  if (path.dirname(root) !== originalRoot || !path.basename(root).startsWith('continuation-')) {
    throw new Error('Use --root with a direct continuation-* directory under the task root');
  }
  const snapshot = await nextSnapshot();
  const summary = {
    currentPlaylistCount: snapshot.rawSongs.length,
    savedHistoryCount: snapshot.historyCount,
    previousAnchorRank: snapshot.anchor.rank,
    previousAnchorName: snapshot.anchor.name,
    currentAnchorPosition: snapshot.anchorIndex + 1,
    savedHistoryOrderUnchanged: snapshot.orderUnchanged,
    nextFirst: snapshot.next[0]?.name,
    nextLast: snapshot.next.at(-1)?.name,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (preview) return;
  if (!snapshot.orderUnchanged) throw new Error('Original first-100 order changed; review the continuation boundary');
  if (await readJsonIfExists(manifestPath)) throw new Error(`Manifest already exists: ${manifestPath}`);
  const completed = new Set(await existingSegmentationKeys());
  const startRank = snapshot.anchor.rank + 1;
  const songs = snapshot.next.map((song, index) => {
    const songKey = songKeyOf(song);
    return {
      rank: startRank + index,
      songKey,
      id: song.id,
      hash: song.hash || song.id,
      albumId: song.albumId ?? '',
      albumAudioId: song.albumAudioId ?? '',
      name: song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      durationMs: Number(song.duration || 0),
      status: completed.has(`lyricSeg_${songKey}`) ? 'done-existing' : 'pending',
      attempts: 0,
    };
  });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    playlistCountAtStart: snapshot.rawSongs.length,
    order: `kugou-provider-client-order-newest-first-after-rank-${snapshot.anchor.rank}-anchor`,
    startRank,
    targetCount: songs.length,
    batchSize: 5,
    songs,
  };
  await writeJson(manifestPath, manifest);
  console.log(`Saved ${songs.length} songs to ${manifestPath}`);
};

const parseKrcLines = content => {
  const lines = [];
  for (const rawLine of String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\](.*)/);
    if (!match) continue;
    const startMs = Number(match[1]);
    const rest = match[3];
    let fullText = '';
    const words = /\<(\d+),(\d+)(?:,\d+)?\>([^\<]*)/g;
    for (let word = words.exec(rest); word; word = words.exec(rest)) fullText += word[3];
    if (!fullText && rest.trim() && !rest.trim().startsWith('[') && !rest.trim().startsWith('<')) {
      fullText = rest.trim();
    }
    if (fullText) lines.push({ key: `${startMs}|${fullText}`, startMs, text: fullText });
  }
  return lines;
};

const fetchBatch = async (batchNumber, { retryNoLyrics = false } = {}) => {
  const manifest = await readJson(manifestPath);
  const start = (batchNumber - 1) * manifest.batchSize;
  const batchPath = path.join(root, 'batches', `batch-${String(batchNumber).padStart(2, '0')}-input.json`);
  const existingBatch = await readJsonIfExists(batchPath);
  const outputBySongKey = new Map((existingBatch?.songs || []).map(song => [song.songKey, song]));
  const selected = manifest.songs.filter(song => song.rank > start && song.rank <= start + manifest.batchSize)
    .filter(song => song.status === 'pending' || song.status === 'fetch-failed'
      || (retryNoLyrics && song.status === 'no-lyrics'));
  if (selected.length === 0) {
    console.log(`Batch ${batchNumber} has no songs that need lyric fetching`);
    return;
  }
  for (const song of selected) {
    song.attempts += 1;
    try {
      const savedInput = outputBySongKey.get(song.songKey);
      if (savedInput) {
        if (savedInput.rank !== song.rank || !Array.isArray(savedInput.lines) || savedInput.lines.length === 0) {
          throw new Error(`Saved lyric input is invalid for rank ${song.rank}`);
        }
        song.status = 'lyrics-ready';
        song.lineCount = savedInput.lines.length;
        delete song.lastError;
        await writeJson(manifestPath, manifest);
        continue;
      }
      const search = await requestFolia({
        provider: 'kugou',
        operation: 'search_lyric',
        params: {
          hash: song.hash,
          album_audio_id: song.albumAudioId,
          duration: song.durationMs,
          keyword: `${song.artist} - ${song.name}`,
        },
      });
      let candidate = search?.candidates?.[0];
      if (!candidate && retryNoLyrics) {
        const fallback = await requestFolia({
          provider: 'kugou',
          operation: 'search_lyric',
          params: {
            hash: String(song.hash).toUpperCase(),
            duration: song.durationMs,
            man: 'no',
            ...(song.albumAudioId ? { album_audio_id: String(song.albumAudioId) } : {}),
          },
        });
        candidate = fallback?.candidates?.[0];
      }
      if (!candidate) {
        song.status = 'no-lyrics';
        await writeJson(manifestPath, manifest);
        continue;
      }
      const lyric = await requestFolia({
        provider: 'kugou',
        operation: 'lyric',
        params: { id: candidate.id, accesskey: candidate.accesskey, fmt: 'krc', decode: true },
      });
      const lines = parseKrcLines(lyric?.decodeContent || lyric?.content);
      if (lines.length === 0) {
        song.status = 'no-lyrics';
        await writeJson(manifestPath, manifest);
        continue;
      }
      outputBySongKey.set(song.songKey, {
        rank: song.rank,
        songKey: song.songKey,
        name: song.name,
        artist: song.artist,
        lines,
      });
      // The immutable source payload lands before the manifest advertises lyrics-ready. A restart
      // reuses this saved payload and repairs the manifest instead of requesting different lyrics.
      const checkpoint = Array.from(outputBySongKey.values()).sort((left, right) => left.rank - right.rank);
      await writeJson(batchPath, { batchNumber, songs: checkpoint });
      song.status = 'lyrics-ready';
      song.lineCount = lines.length;
    } catch (error) {
      song.status = 'fetch-failed';
      song.lastError = error instanceof Error ? error.message : String(error);
    }
    await writeJson(manifestPath, manifest);
  }

  const output = Array.from(outputBySongKey.values()).sort((left, right) => left.rank - right.rank);
  await writeJson(batchPath, { batchNumber, songs: output });
  await writeJson(manifestPath, manifest);
  console.log(`Saved ${output.length} lyric payloads to ${batchPath}`);
};

const applyOutput = async (outputFile, { allowCompleted = false } = {}) => {
  const manifest = await readJson(manifestPath);
  const output = await readJson(path.resolve(outputFile));
  const records = [];

  for (const song of output.songs || []) {
    const manifestSong = manifest.songs.find(item => item.songKey === song.songKey);
    if (!manifestSong) throw new Error(`Song is outside the fixed manifest: ${song.songKey}`);
    if (!allowCompleted && String(manifestSong.status).startsWith('done')) {
      throw new Error(`Refusing to overwrite completed segmentation: ${song.songKey}`);
    }
    if (!allowCompleted && manifestSong.status !== 'lyrics-ready') {
      throw new Error(`Song is not ready for segmentation: ${song.songKey} (${manifestSong.status})`);
    }
    const batchNumber = Math.floor((manifestSong.rank - 1) / manifest.batchSize) + 1;
    const inputPath = path.join(root, 'batches', `batch-${String(batchNumber).padStart(2, '0')}-input.json`);
    const input = await readJson(inputPath);
    const inputSong = input.songs.find(item => item.songKey === song.songKey);
    if (!inputSong) throw new Error(`Original lyric input is missing: ${song.songKey}`);
    if (!Array.isArray(song.lines) || song.lines.length !== inputSong.lines.length) {
      throw new Error(`Incomplete segmentation: ${song.songKey} has ${song.lines?.length || 0}/${inputSong.lines.length} lines`);
    }
    const inputByKey = new Map(inputSong.lines.map(row => [row.key, row.text]));
    const seenKeys = new Set();
    const lines = {};
    for (const row of song.lines || []) {
      if (seenKeys.has(row.key)) throw new Error(`Duplicate lyric line key: ${song.songKey} ${row.key}`);
      seenKeys.add(row.key);
      if (!inputByKey.has(row.key) || inputByKey.get(row.key) !== row.text) {
        throw new Error(`Segmentation line does not match the original input: ${song.songKey} ${row.key}`);
      }
      if (!Array.isArray(row.segments) || row.segments.join('') !== row.text) {
        throw new Error(`Lossless validation failed: ${song.songKey} ${row.key}`);
      }
      lines[row.key] = row.segments;
    }
    if (seenKeys.size !== inputByKey.size) throw new Error(`Segmentation does not cover every original line: ${song.songKey}`);
    records.push({
      key: `lyricSeg_${song.songKey}`,
      data: { version: 1, songKey: song.songKey, updatedAt: Date.now(), source: 'ai', lines },
      timestamp: Date.now(),
    });
  }

  const expression = `(async()=>{\n`
    + `const records=${JSON.stringify(records)};\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `await new Promise((resolve,reject)=>{const tx=db.transaction("api_cache","readwrite");const store=tx.objectStore("api_cache");records.forEach(record=>store.put(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});\n`
    + `const verified=[];for(const record of records){const value=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").get(record.key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});verified.push(Boolean(value&&value.timestamp===record.timestamp&&JSON.stringify(value.data)===JSON.stringify(record.data)))}\n`
    + `db.close();return verified;\n`
    + `})()`;
  const verified = await evaluate(expression);
  if (!Array.isArray(verified) || verified.some(value => value !== true)) {
    throw new Error('IndexedDB read-back validation failed');
  }

  for (const record of records) {
    const manifestSong = manifest.songs.find(item => item.songKey === record.data.songKey);
    manifestSong.status = 'done';
    manifestSong.segmentedLineCount = Object.keys(record.data.lines).length;
    manifestSong.completedAt = new Date().toISOString();
    delete manifestSong.lastError;
  }
  await writeJson(manifestPath, manifest);
  console.log(`Applied and verified ${records.length} song records`);
};

const kugouSongKeyVariants = songKey => {
  const prefix = 'online:kugou:';
  if (!songKey.startsWith(prefix)) return [songKey];
  const mediaId = songKey.slice(prefix.length);
  return Array.from(new Set([
    `${prefix}${mediaId.toLowerCase()}`,
    `${prefix}${mediaId.toUpperCase()}`,
  ]));
};

const writeKugouCaseAliases = async () => {
  const manifest = await readJson(manifestPath);
  const mappings = manifest.songs
    .filter(song => song.status === 'done')
    .map(song => ({ canonical: song.songKey, variants: kugouSongKeyVariants(song.songKey) }));
  const expression = `(async()=>{\n`
    + `const mappings=${JSON.stringify(mappings)};\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `let written=0;await new Promise((resolve,reject)=>{const tx=db.transaction("api_cache","readwrite");const store=tx.objectStore("api_cache");for(const mapping of mappings){const request=store.get("lyricSeg_"+mapping.canonical);request.onsuccess=()=>{const row=request.result;if(!row)return;for(const variant of mapping.variants){if(variant===mapping.canonical)continue;store.put({key:"lyricSeg_"+variant,data:{...row.data,songKey:variant,updatedAt:Date.now()},timestamp:Date.now()});written+=1}}}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});\n`
    + `db.close();return written;\n`
    + `})()`;
  const written = await evaluate(expression);
  console.log(`Wrote ${written} KuGou case-alias records`);
};

const restoreAll = async () => {
  const manifest = await readJson(manifestPath);
  const done = manifest.songs.filter(song => song.status === 'done');
  for (const song of done) {
    const batchNumber = Math.floor((song.rank - 1) / manifest.batchSize) + 1;
    const outputPath = path.join(
      root,
      'batches',
      `batch-${String(batchNumber).padStart(2, '0')}-output-part-${String(song.rank).padStart(2, '0')}.json`,
    );
    await applyOutput(outputPath, { allowCompleted: true });
  }
  await writeKugouCaseAliases();
  await audit();
};

const exportLrc = async () => {
  const manifest = await readJson(manifestPath);
  const lrcRoot = path.join(root, 'lrc');
  await mkdir(lrcRoot, { recursive: true });
  let exported = 0;
  let lyricLines = 0;

  for (const song of manifest.songs) {
    if (song.status !== 'done' && song.status !== 'lyrics-ready') continue;
    const batchNumber = Math.floor((song.rank - 1) / manifest.batchSize) + 1;
    const input = await readJson(path.join(
      root,
      'batches',
      `batch-${String(batchNumber).padStart(2, '0')}-input.json`,
    ));
    const inputSong = input.songs.find(item => item.songKey === song.songKey);
    if (!inputSong?.lines?.length) throw new Error(`Lyrics missing for rank ${song.rank}`);

    const orderedLines = inputSong.lines
      .map((line, index) => ({ line, index, startMs: Number(line.startMs) }))
      .sort((left, right) => left.startMs - right.startMs || left.index - right.index);
    if (orderedLines.some(item => !Number.isFinite(item.startMs) || item.startMs < 0)) {
      throw new Error(`Invalid lyric timestamp for rank ${song.rank}`);
    }

    const header = [
      `[ti:${song.name}]`,
      `[ar:${song.artist || ''}]`,
      '[by:Folia Codex AI segmentation backup]',
      '',
    ];
    // Provider credits can arrive slightly out of order; LRC consumers expect chronological rows.
    const body = orderedLines.map(({ line }) => `${formatLrcTimestamp(line.startMs)}${String(line.text || '')}`);
    const hashSuffix = String(song.id || '').slice(0, 8);
    const descriptiveBase = [
      String(song.rank).padStart(3, '0'),
      safeFilenamePart(song.name),
      safeFilenamePart(song.artist),
    ].filter(Boolean).join(' - ');
    const fileSuffix = hashSuffix ? ` - [${hashSuffix}]` : '';
    const baseName = `${descriptiveBase.slice(0, 96 - fileSuffix.length).replace(/[. ]+$/gu, '')}${fileSuffix}`;
    await writeFile(path.join(lrcRoot, `${baseName}.lrc`), `${[...header, ...body].join('\n')}\n`, 'utf8');
    exported += 1;
    lyricLines += body.length;
  }

  const missing = manifest.songs.filter(song => song.status === 'no-lyrics');
  await writeFile(path.join(lrcRoot, 'README.md'), [
    '# LRC 歌词导出',
    '',
    `- 导出日期：${new Date().toISOString().slice(0, 10)}`,
    `- LRC 文件：${exported} 个`,
    `- 歌词行：${lyricLines} 行`,
    '- 时间戳精度：毫秒（`[mm:ss.mmm]`）',
    `- 无歌词：${missing.map(song => `${song.rank}. ${song.name}`).join('；') || '无'}`,
    '',
    '这些文件由已保存的酷狗逐行歌词生成，并保留原文空白；若上游行序与时间戳不一致，仅在 LRC 导出时按时间戳稳定排序。AI 分词边界完整保存在同级 `batches/` 的输出 JSON 中。',
    '',
  ].join('\n'), 'utf8');
  console.log(`Exported ${exported} LRC files with ${lyricLines} lyric lines`);
};

const audit = async ({ requireComplete = true } = {}) => {
  const manifest = await readJson(manifestPath);
  const deviceEntries = await evaluate(`(async()=>{\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `const rows=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `db.close();return rows.filter(row=>String(row.key).startsWith("lyricSeg_")).map(row=>({key:String(row.key),version:row.data?.version,songKey:row.data?.songKey,source:row.data?.source,lineCount:Object.keys(row.data?.lines||{}).length,lines:row.data?.lines||{}}));\n`
    + `})()`);
  const byKey = new Map(deviceEntries.map(entry => [entry.key, entry]));
  const done = manifest.songs.filter(song => song.status === 'done');
  const noLyrics = manifest.songs.filter(song => song.status === 'no-lyrics');
  const unfinished = manifest.songs.filter(song => !['done', 'no-lyrics'].includes(song.status));
  const missing = [];
  const mismatched = [];
  const missingAliases = [];
  const mismatchedAliases = [];
  const invalidOutputs = [];
  for (const song of done) {
    const key = `lyricSeg_${song.songKey}`;
    const entry = byKey.get(key);
    if (!entry) {
      missing.push(song.rank);
      continue;
    }
    const batchNumber = Math.floor((song.rank - 1) / manifest.batchSize) + 1;
    const paddedBatch = String(batchNumber).padStart(2, '0');
    const input = await readJson(path.join(root, 'batches', `batch-${paddedBatch}-input.json`));
    const outputPart = String(song.rank).padStart(2, '0');
    const output = await readJson(path.join(root, 'batches', `batch-${paddedBatch}-output-part-${outputPart}.json`));
    const inputSong = input.songs.find(item => item.songKey === song.songKey);
    const outputSong = output.songs?.find(item => item.songKey === song.songKey);
    const expectedLines = {};
    let outputValid = Boolean(inputSong && outputSong && outputSong.lines.length === inputSong.lines.length);
    if (outputValid) {
      const inputByKey = new Map(inputSong.lines.map(row => [row.key, row.text]));
      for (const row of outputSong.lines) {
        if (!inputByKey.has(row.key) || inputByKey.get(row.key) !== row.text
          || !Array.isArray(row.segments) || row.segments.join('') !== row.text
          || Object.hasOwn(expectedLines, row.key)) {
          outputValid = false;
          break;
        }
        expectedLines[row.key] = row.segments;
      }
      if (Object.keys(expectedLines).length !== inputByKey.size) outputValid = false;
    }
    if (!outputValid) invalidOutputs.push(song.rank);

    const deviceLineKeys = Object.keys(entry.lines || {});
    const expectedLineKeys = Object.keys(expectedLines);
    const deviceContentMatches = outputValid
      && deviceLineKeys.length === expectedLineKeys.length
      && expectedLineKeys.every(lineKey => (
        Array.isArray(entry.lines[lineKey])
        && JSON.stringify(entry.lines[lineKey]) === JSON.stringify(expectedLines[lineKey])
      ));
    if (entry.songKey !== song.songKey
      || entry.version !== 1
      || entry.source !== 'ai'
      || entry.lineCount !== song.segmentedLineCount
      || entry.lineCount < 1
      || !deviceContentMatches) {
      mismatched.push(song.rank);
    }
    for (const aliasSongKey of kugouSongKeyVariants(song.songKey)) {
      if (aliasSongKey === song.songKey) continue;
      const alias = byKey.get(`lyricSeg_${aliasSongKey}`);
      if (!alias) {
        missingAliases.push(song.rank);
        continue;
      }
      const aliasLineKeys = Object.keys(alias.lines || {});
      const aliasContentMatches = outputValid
        && aliasLineKeys.length === expectedLineKeys.length
        && expectedLineKeys.every(lineKey => (
          Array.isArray(alias.lines[lineKey])
          && JSON.stringify(alias.lines[lineKey]) === JSON.stringify(expectedLines[lineKey])
        ));
      if (alias.songKey !== aliasSongKey || alias.version !== 1 || alias.source !== 'ai' || !aliasContentMatches) {
        mismatchedAliases.push(song.rank);
      }
    }
  }
  const summary = {
    target: manifest.targetCount,
    done: done.length,
    noLyrics: noLyrics.length,
    unfinished: unfinished.length,
    missing: missing.length,
    mismatched: mismatched.length,
    invalidOutputs: invalidOutputs.length,
    missingAliases: missingAliases.length,
    mismatchedAliases: mismatchedAliases.length,
    deviceSegmentationRecords: deviceEntries.length,
    noLyricsSongs: noLyrics.map(song => ({ rank: song.rank, name: song.name })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (manifest.targetCount !== 100 || done.length + noLyrics.length + unfinished.length !== manifest.targetCount
    || (requireComplete && unfinished.length) || missing.length || mismatched.length || invalidOutputs.length
    || missingAliases.length || mismatchedAliases.length) {
    throw new Error('Segmentation audit failed');
  }
};

const command = process.argv[2];
if (command === 'init') await init();
else if (command === 'preview-next') await initNext({ preview: true });
else if (command === 'init-next') await initNext();
else if (command === 'fetch-batch') await fetchBatch(Number(process.argv[3] || 1));
else if (command === 'retry-no-lyrics') {
  const manifest = await readJson(manifestPath);
  const batches = new Set(manifest.songs.filter(song => song.status === 'no-lyrics')
    .map(song => Math.floor((song.rank - 1) / manifest.batchSize) + 1));
  for (const batch of batches) await fetchBatch(batch, { retryNoLyrics: true });
}
else if (command === 'apply') await applyOutput(process.argv[3]);
else if (command === 'reapply') await applyOutput(process.argv[3], { allowCompleted: true });
else if (command === 'restore-all') await restoreAll();
else if (command === 'export-lrc') await exportLrc();
else if (command === 'write-kugou-case-aliases') await writeKugouCaseAliases();
else if (command === 'audit') await audit();
else if (command === 'audit-partial') await audit({ requireComplete: false });
else throw new Error('Usage: node scripts/codex-kugou-ai-segmentation.mjs <init|preview-next|init-next|fetch-batch N|retry-no-lyrics|apply FILE|reapply FILE|restore-all|export-lrc|write-kugou-case-aliases|audit|audit-partial> [--root DIRECTORY]');
