import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.URL || "http://localhost:4173/?test=1";
const OUT = "shots";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = "shots/shot.log";
const log = (m) => {
  console.log(m);
  try {
    fs.appendFileSync(LOG, m + "\n");
  } catch {}
};
fs.rmSync(LOG, { force: true });

// watchdog
setTimeout(() => {
  log("WATCHDOG: keluar paksa");
  process.exit(0);
}, 150000);

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-first-run",
    "--disable-extensions",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--disable-gpu-sandbox",
    "--hide-scrollbars",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: 1 });
page.setDefaultTimeout(12000);

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) =>
  errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`)
);
page.on("error", (err) => errors.push(`[pageerror-event] ${err.message}`));

const clickNode = (id) =>
  page.evaluate(
    (rid) => document.querySelector(`.node[data-region="${rid}"]`)?.click(),
    id
  );

// jalankan langkah dengan timeout agar tidak menggantung
const withTimeout = (label, fn, ms = 30000) =>
  Promise.race([
    fn(),
    new Promise((res) =>
      setTimeout(() => {
        log(`⚠ timeout langkah: ${label}`);
        res();
      }, ms)
    ),
  ]);

log("Memuat halaman…");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

await sleep(1200);
await withTimeout("00-loader", () =>
  page.screenshot({ path: `${OUT}/00-loader.png` })
);

try {
  await page.waitForSelector(".loader.done", { timeout: 45000 });
  log("Loader selesai ✓");
} catch {
  log("✗ Loader tidak selesai");
  log("=== ERROR ===");
  for (const e of errors) log(e);
  process.exit(1);
}

await sleep(5200);
await withTimeout("01-overview", () =>
  page.screenshot({ path: `${OUT}/01-overview.png` })
);
log("01-overview.png ✓");

await withTimeout("fokus-jawa", () => clickNode("jawa"));
await sleep(2600);
await withTimeout("02-jawa", () =>
  page.screenshot({ path: `${OUT}/02-jawa.png` })
);
log("02-jawa.png ✓");

await withTimeout("fokus-sumatera", () => clickNode("sumatera"));
await sleep(2600);
await withTimeout("03-sumatera", () =>
  page.screenshot({ path: `${OUT}/03-sumatera.png` })
);
log("03-sumatera.png ✓");

// banner & diagnostik (sebelum langkah opsional)
try {
  const banner = await page.$eval("#focus-name", (el) => el.textContent);
  log("Banner fokus: " + banner);
} catch {
  log("✗ gagal membaca banner");
}

try {
  const info = await page.evaluate(() => {
    const r = window.__dbg?.renderer;
    const s = window.__dbg?.scene;
    const entries = window.__dbg?.regionEntries || [];
    return {
      triangles: r?.info.render.triangles ?? null,
      calls: r?.info.render.calls ?? null,
      meshes: s?.children.filter((c) => c.isMesh).length ?? null,
      regions: entries.map((e) => e.def.id),
      camPos: window.__dbg?.camera
        ? [...window.__dbg.camera.position.toArray().map((v) => v.toFixed(1))]
        : null,
    };
  });
  log("Diagnostik: " + JSON.stringify(info));
} catch {
  log("✗ gagal membaca diagnostik (window.__dbg tidak ada?)");
}

if (errors.length) {
  log("=== ERROR KONSOL ===");
  for (const e of errors) log(e);
} else {
  log("✓ Tidak ada error konsol");
}

// langkah opsional: Papua
await withTimeout("fokus-papua", () => clickNode("papua"));
await sleep(2600);
await withTimeout("04-papua", () =>
  page.screenshot({ path: `${OUT}/04-papua.png` })
);
log("04-papua.png ✓");

try {
  await browser.close();
} catch {}
try {
  browser.process()?.kill();
} catch {}
process.exit(0);
