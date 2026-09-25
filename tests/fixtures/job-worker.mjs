let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const request = input.trim() ? JSON.parse(input) : {};
  process.stdout.write('{"type":"status","message":"fixture');
  process.stdout.write(' ready"}\n');
  process.stdout.write("diagnostic text\n");
  process.stderr.write("stderr diagnostic\n");

  if (request.wait) {
    process.stdout.write('{"type":"progress","step":1,"total":10}\n');
    setInterval(() => undefined, 1_000);
    return;
  }

  process.stdout.write('{"type":"progress","step":2,"total":4}\n');
  process.stdout.write('{"type":"done","path":"fixture-output.png"}\n');
});
