import { writeFile } from "node:fs/promises";
import { loadSnapshot } from "../src/lib/reads";
const snapshot = await loadSnapshot({ limit: 8 });
snapshot.source = "saved";
// The URI includes a second copy of the large image. Live detail reads retrieve it again.
for (const token of snapshot.tokens) token.uri = "";
await writeFile(
  "public/snapshot.json",
  JSON.stringify(snapshot, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ),
);
console.log(
  JSON.stringify({
    block: snapshot.block,
    hash: snapshot.hash,
    supply: snapshot.totalSupply,
    ids: snapshot.tokens.map((t) => t.id),
  }),
);
