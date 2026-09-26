import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
const output = valueAfter("--output");
const imageJob = args.includes("--job-id");
let request = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  request += chunk;
});
process.stdin.on("end", () => {
  fs.mkdirSync(output, { recursive: true });
  process.stdout.write('{"type":"status","message":"Fixture running"}\n');
  process.stdout.write('{"type":"progress","step":1,"total":2}\n');
  const result = imageJob ? path.join(output, "fixture.png") : output;
  if (imageJob) {
    fs.writeFileSync(path.join(output, "request.json"), request.trim());
    process.stdout.write(
      `${JSON.stringify({
        type: "preview",
        path: process.argv[1],
        step: 1,
        total: 2,
      })}\n`,
    );
    const preview = path.join(output, "preview-fixture-1.png");
    fs.writeFileSync(preview, "preview");
    process.stdout.write(
      `${JSON.stringify({
        type: "preview",
        path: preview,
        step: 1,
        total: 2,
        width: 640,
        height: 512,
      })}\n`,
    );
    fs.writeFileSync(result, "fixture");
  } else fs.writeFileSync(path.join(result, "adapter_config.json"), "{}");
  process.stdout.write(
    `${JSON.stringify({
      type: "done",
      path: result,
      ...(imageJob ? { width: 640, height: 512 } : {}),
    })}\n`,
  );
});
