import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const checkedAt = '2026-05-31';
const imageDir = path.join(cwd, 'public', 'station-images');
const manifestPath = path.join(cwd, 'src', 'data', 'stationImageSources.json');
const stationInfoPath = path.join(cwd, 'src', 'data', 'stationInfo.ts');
const tmpDir = path.join(os.tmpdir(), 'traintracks-station-images');

const ffmpegCandidates = [
    process.env.FFMPEG_PATH,
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'ffmpeg',
].filter(Boolean);

const sources = [
    {
        stationId: 'L1-20',
        localPath: '/station-images/lrt1-fernando-poe-jr.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Fernando_Poe_Jr_LRT_station_platform_in_March_2026.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Fernando_Poe_Jr._station',
        label: 'Fernando Poe Jr. station platform, March 2026',
    },
    {
        stationId: 'L1-19',
        localPath: '/station-images/lrt1-balintawak.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/LRT1_Balintawak_Platform%2C_Q.C.%2C_Mar_2025.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Balintawak_station',
        label: 'Balintawak station platform, March 2025',
    },
    {
        stationId: 'L1-18',
        localPath: '/station-images/lrt1-monumento.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/51/LRT-1_Yamaha_Monumento_Station_Platform%2C_Caloocan%2C_Apr_2026.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Monumento_station',
        label: 'Monumento station platform, April 2026',
    },
    {
        stationId: 'L1-17',
        localPath: '/station-images/lrt1-5th-avenue.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/5th_Avenue_LRT_Station.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/5th_Avenue_station_(LRT)',
        label: '5th Avenue station reference photo',
    },
    {
        stationId: 'L1-16',
        localPath: '/station-images/lrt1-r-papa.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/47/R._Papa_station_3351.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/R._Papa_station',
        label: 'R. Papa station reference photo',
    },
    {
        stationId: 'L1-15',
        localPath: '/station-images/lrt1-abad-santos.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Abad_Santos_LRT_station_platform_in_March_2026_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Abad_Santos_station',
        label: 'Abad Santos station platform, March 2026',
    },
    {
        stationId: 'L1-14',
        localPath: '/station-images/lrt1-blumentritt.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/48/Blumentritt_station_15.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Blumentritt_station_(LRT)',
        label: 'Blumentritt station reference photo',
    },
    {
        stationId: 'L1-13',
        localPath: '/station-images/lrt1-tayuman.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1c/Tayuman_station_03.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Tayuman_station',
        label: 'Tayuman station reference photo',
    },
    {
        stationId: 'L1-12',
        localPath: '/station-images/lrt1-bambang.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Bambang_station_02.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Bambang_station',
        label: 'Bambang station reference photo',
    },
    {
        stationId: 'L1-11',
        localPath: '/station-images/lrt1-doroteo-jose.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/81/Doroteo_Jose_LRT-1_2019-12-21.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Doroteo_Jose_station',
        label: 'Doroteo Jose station platform, December 2019',
    },
    {
        stationId: 'L1-10',
        localPath: '/station-images/lrt1-carriedo.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/55/LRT1_Carriedo_Station%2C_Manila%2C_June_2025.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Carriedo_station',
        label: 'Carriedo station, June 2025',
    },
    {
        stationId: 'L1-09',
        localPath: '/station-images/lrt1-central-terminal.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Central_Terminal_Platform.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Central_Terminal_station',
        label: 'Central Terminal station platform',
    },
    {
        stationId: 'L1-08',
        localPath: '/station-images/lrt1-united-nations.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/de/LRT-1_United_Nations_Avenue_Platform%2C_Manila%2C_Sep_2025.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/United_Nations_station',
        label: 'United Nations station platform, September 2025',
    },
    {
        stationId: 'L1-07',
        localPath: '/station-images/lrt1-pedro-gil.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/LRT1_1G_%281000_class%29_train_at_Pedro_Gil_station.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Pedro_Gil_station',
        label: 'Pedro Gil station platform reference',
    },
    {
        stationId: 'L1-06',
        localPath: '/station-images/lrt1-quirino.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/95/9663LRT_Stations_Manila_Landmarks_03.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Quirino_station_(LRT)',
        label: 'Quirino station reference photo',
    },
    {
        stationId: 'L1-05',
        localPath: '/station-images/lrt1-vito-cruz.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/72/9663LRT_Stations_Manila_Landmarks_14.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Vito_Cruz_station',
        label: 'Vito Cruz station reference photo',
    },
    {
        stationId: 'L1-04',
        localPath: '/station-images/lrt1-gil-puyat.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Line_1_Gil_Puyat_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Gil_Puyat_station',
        label: 'Gil Puyat station platform reference',
    },
    {
        stationId: 'L1-03',
        localPath: '/station-images/lrt1-libertad.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/LRT-1_Libertad_Station%2C_Pasay_City%2C_Mar_2024.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Libertad_station_(LRT)',
        label: 'Libertad station, March 2024',
    },
    {
        stationId: 'L1-02',
        localPath: '/station-images/lrt1-edsa.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/EDSA_LRT-1_Station_in_February_2026_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/EDSA_station',
        label: 'EDSA station, February 2026',
    },
    {
        stationId: 'L1-01',
        localPath: '/station-images/lrt1-baclaran.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/17/LRT1_Baclaran_station_and_1000_class.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Baclaran_station',
        label: 'Baclaran station platform reference',
    },
    {
        stationId: 'L1-21',
        localPath: '/station-images/lrt1-redemptorist.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/af/LRT-1_Redemptorist-Aseana_Station_%28with_updated_signage%29%2C_October_22%2C_2025.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Redemptorist-Aseana_station',
        label: 'Redemptorist-Aseana station with updated signage, October 2025',
    },
    {
        stationId: 'L1-22',
        localPath: '/station-images/lrt1-mia.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5d/MIAPlatform-A.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/MIA_Road_station',
        label: 'MIA Road station platform reference',
    },
    {
        stationId: 'L1-23',
        localPath: '/station-images/lrt1-pitx.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2d/Asiaworldplatform-A.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Asiaworld_station',
        label: 'PITX/Asiaworld station platform reference',
    },
    {
        stationId: 'L1-24',
        localPath: '/station-images/lrt1-ninoy-aquino.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Ninoyaquinoplatform.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Ninoy_Aquino_station',
        label: 'Ninoy Aquino station platform reference',
    },
    {
        stationId: 'L1-25',
        localPath: '/station-images/lrt1-dr-santos.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/20/LRT-1_CEP_Dr._Santos_%281%29_2024-11-24.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Dr._Santos_station',
        label: 'Dr. Santos station, November 2024',
    },
    {
        stationId: 'L2-01',
        localPath: '/station-images/lrt2-recto.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Line_2_Recto_Station_Platform_3.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Recto_station',
        label: 'Recto station platform reference',
    },
    {
        stationId: 'L2-02',
        localPath: '/station-images/lrt2-legarda.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Line_2_Legarda_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Legarda_station',
        label: 'Legarda station platform reference',
    },
    {
        stationId: 'L2-03',
        localPath: '/station-images/lrt2-pureza.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Line_2_Pureza_Station_Platform_4.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Pureza_station',
        label: 'Pureza station platform reference',
    },
    {
        stationId: 'L2-04',
        localPath: '/station-images/lrt2-v-mapa.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/dc/MRT-2_V._Mapa_Station_Platform_11.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/V._Mapa_station',
        label: 'V. Mapa station platform reference',
    },
    {
        stationId: 'L2-05',
        localPath: '/station-images/lrt2-j-ruiz.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Line_2_J._Ruiz_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/J._Ruiz_station',
        label: 'J. Ruiz station platform reference',
    },
    {
        stationId: 'L2-06',
        localPath: '/station-images/lrt2-gilmore.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/MRT-2_Gilmore_Station_Platform_3.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Gilmore_station',
        label: 'Gilmore station platform reference',
    },
    {
        stationId: 'L2-07',
        localPath: '/station-images/lrt2-betty-go-belmonte.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/50/LRT-2_Betty_Go_Belmonte_Station_Platform%2C_Q.C.%2C_Jun_2025_%281%29.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Betty_Go-Belmonte_station',
        label: 'Betty Go-Belmonte station platform, June 2025',
    },
    {
        stationId: 'L2-08',
        localPath: '/station-images/lrt2-araneta-cubao.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Line_2_Araneta_Center-Cubao_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Araneta_Center-Cubao_station_(LRT)',
        label: 'Araneta-Cubao LRT-2 station platform reference',
    },
    {
        stationId: 'L2-09',
        localPath: '/station-images/lrt2-anonas.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/17/Line_2_Anonas_Station_Platform_14.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Anonas_station',
        label: 'Anonas station platform reference',
    },
    {
        stationId: 'L2-10',
        localPath: '/station-images/lrt2-katipunan.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Line_2_Katipunan_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Katipunan_station',
        label: 'Katipunan station platform reference',
    },
    {
        stationId: 'L2-11',
        localPath: '/station-images/lrt2-santolan.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Line_2_Santolan_Station_Platform_6.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Santolan_station',
        label: 'Santolan station platform reference',
    },
    {
        stationId: 'L2-12',
        localPath: '/station-images/lrt2-marikina-pasig.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Line_2_Marikina%E2%80%93Pasig_Station_Platform.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Marikina-Pasig_station',
        label: 'Marikina-Pasig station platform reference',
    },
    {
        stationId: 'L2-13',
        localPath: '/station-images/lrt2-antipolo.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Line_2_Antipolo_Station_Platform.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Antipolo_station',
        label: 'Antipolo station platform reference',
    },
    {
        stationId: 'M3-01',
        localPath: '/station-images/mrt3-north-avenue.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/41/MRT-3_North_Avenue_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/North_Avenue_station',
        label: 'North Avenue station platform reference',
    },
    {
        stationId: 'M3-02',
        localPath: '/station-images/mrt3-quezon-avenue.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/da/Quezon_Avenue_station_after_rehabilitation_-_11.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Quezon_Avenue_station',
        label: 'Quezon Avenue station after rehabilitation',
    },
    {
        stationId: 'M3-03',
        localPath: '/station-images/mrt3-gma-kamuning.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/db/MRT-3_Kamuning_Station_Platform_5.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/GMA-Kamuning_station',
        label: 'GMA-Kamuning station platform reference',
    },
    {
        stationId: 'M3-04',
        localPath: '/station-images/mrt3-araneta-cubao.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Line_3_Araneta_Center-Cubao_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Araneta_Center-Cubao_station_(MRT)',
        label: 'Araneta-Cubao MRT-3 station platform reference',
    },
    {
        stationId: 'M3-05',
        localPath: '/station-images/mrt3-santolan-annapolis.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/87/MRT-3_Santolan_Station_Platform_7.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Santolan-Annapolis_station',
        label: 'Santolan-Annapolis station platform reference',
    },
    {
        stationId: 'M3-06',
        localPath: '/station-images/mrt3-ortigas.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/73/MRT-3_Ortigas_Station_Platform_2.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Ortigas_station',
        label: 'Ortigas station platform reference',
    },
    {
        stationId: 'M3-07',
        localPath: '/station-images/mrt3-shaw-boulevard.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/MRT-3_Shaw_Boulevard_Station_Platform_2.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Shaw_Boulevard_station',
        label: 'Shaw Boulevard station platform reference',
    },
    {
        stationId: 'M3-08',
        localPath: '/station-images/mrt3-boni.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/39/MRT-3_Boni_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Boni_station',
        label: 'Boni station platform reference',
    },
    {
        stationId: 'M3-09',
        localPath: '/station-images/mrt3-guadalupe.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Guadalupe_station_building%2C_December_18%2C_2001.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Guadalupe_station_(MRT)',
        label: 'Guadalupe station building reference',
    },
    {
        stationId: 'M3-10',
        localPath: '/station-images/mrt3-buendia.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/MRT-3_Buendia_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Buendia_station_(MRT)',
        label: 'Buendia station platform reference',
    },
    {
        stationId: 'M3-11',
        localPath: '/station-images/mrt3-ayala.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Line_3_Ayala_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Ayala_station',
        label: 'Ayala station platform reference',
    },
    {
        stationId: 'M3-12',
        localPath: '/station-images/mrt3-magallanes.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Line_3_Magallanes_Station_Platform_1.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Magallanes_station',
        label: 'Magallanes station platform reference',
    },
    {
        stationId: 'M3-13',
        localPath: '/station-images/mrt3-taft-avenue.webp',
        sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Taft_Avenue_MRT_station_platform_in_March_2026.jpg',
        sourcePage: 'https://en.wikipedia.org/wiki/Taft_Avenue_station',
        label: 'Taft Avenue station platform, March 2026',
    },
];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDownloadUrl(sourceUrl) {
    const fileName = decodeURIComponent(path.posix.basename(new URL(sourceUrl).pathname));
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=960`;
}

function findFfmpeg() {
    for (const candidate of ffmpegCandidates) {
        const result = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
        if (result.status === 0) return candidate;
    }
    throw new Error('ffmpeg was not found. Set FFMPEG_PATH or install ffmpeg.');
}

function stationInfoImageBlock(localPath) {
    return `images: [\r\n            '${localPath}',\r\n        ]`;
}

async function downloadSource(source, targetPath) {
    const retryDelaysMs = [0, 5_000, 15_000, 30_000, 60_000];
    const downloadUrl = getDownloadUrl(source.sourceUrl);

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        if (retryDelaysMs[attempt] > 0) {
            console.log(`${source.stationId} retrying after ${Math.round(retryDelaysMs[attempt] / 1000)}s`);
            await sleep(retryDelaysMs[attempt]);
        }

        const response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'TrainTracksStationImageRepair/1.0 (local asset preparation; local development)',
            },
        });

        if (response.ok) {
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length < 1024) {
                throw new Error(`${source.stationId} download was unexpectedly tiny`);
            }
            await fs.writeFile(targetPath, bytes);
            return;
        }

        if (response.status !== 429 || attempt === retryDelaysMs.length - 1) {
            throw new Error(`${source.stationId} download failed: ${response.status} ${response.statusText}`);
        }
    }
}

function convertToWebp(ffmpeg, sourcePath, outputPath) {
    const result = spawnSync(ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        sourcePath,
        '-vf',
        'scale=960:-2',
        '-quality',
        '78',
        outputPath,
    ], { encoding: 'utf8' });

    if (result.status !== 0) {
        throw new Error(`ffmpeg failed for ${path.basename(outputPath)}: ${result.stderr || result.error?.message || 'unknown error'}`);
    }
}

async function updateStationInfo() {
    let source = await fs.readFile(stationInfoPath, 'utf8');

    for (const item of sources) {
        const pattern = new RegExp(`('${item.stationId}'\\s*:\\s*\\{[\\s\\S]*?)images:\\s*\\[[\\s\\S]*?\\]`, 'm');
        if (!pattern.test(source)) {
            throw new Error(`Could not find images block for ${item.stationId}`);
        }
        source = source.replace(pattern, `$1${stationInfoImageBlock(item.localPath)}`);
    }

    await fs.writeFile(stationInfoPath, source, 'utf8');
}

async function main() {
    const ffmpeg = findFfmpeg();
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const manifest = [];
    for (const source of sources) {
        const extension = path.extname(new URL(source.sourceUrl).pathname) || '.jpg';
        const tempSource = path.join(tmpDir, `${source.stationId}${extension}`);
        const outputPath = path.join(cwd, 'public', source.localPath);

        let stat = null;
        try {
            stat = await fs.stat(outputPath);
        } catch {
            stat = null;
        }

        if (!stat || stat.size <= 1024) {
            await downloadSource(source, tempSource);
            convertToWebp(ffmpeg, tempSource, outputPath);
            stat = await fs.stat(outputPath);
            await sleep(1_500);
        } else {
            console.log(`${source.stationId} using existing ${source.localPath}`);
        }

        manifest.push({
            stationId: source.stationId,
            localPath: source.localPath,
            sourceUrl: source.sourceUrl,
            sourcePage: source.sourcePage,
            label: source.label,
            checkedAt,
            scope: 'live',
            byteSize: stat.size,
        });

        console.log(`${source.stationId} -> ${source.localPath}`);
    }

    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await updateStationInfo();
    console.log(`Prepared ${manifest.length} station images`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
