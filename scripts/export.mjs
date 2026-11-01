import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await cp("out/index.html", "dist/index.html");
await cp("out/_next", "dist/_next", { recursive: true });
for (const file of await readdir("public"))
  await cp(`public/${file}`, `dist/${file}`, { recursive: true });
const html = (await readFile("dist/index.html", "utf8"))
  .replaceAll('"/_next/', '"./_next/')
  .replaceAll('\\"/_next/', '\\"./_next/');
await writeFile("dist/index.html", html);
async function walk(dir) {
  let total = 0;
  for (const f of await readdir(dir)) {
    const p = path.join(dir, f);
    const s = await stat(p);
    if (s.isDirectory()) total += await walk(p);
    else if (p.endsWith(".map")) await rm(p);
    else {
      if (p.endsWith(".css")) {
        const css = await readFile(p, "utf8");
        await writeFile(
          p,
          css.replace(
            /url\((['"]?)(?:\.\/)?_next\/static\/media\//g,
            "url($1../media/",
          ),
        );
      }
      total += (await stat(p)).size;
    }
  }
  return total;
}
console.log(
  `Static export: ${await walk("dist")} bytes. Entry: dist/index.html`,
);
