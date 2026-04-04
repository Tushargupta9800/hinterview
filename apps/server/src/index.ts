import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

app.listen(port, () => {
  console.log(`hinterview-server listening on http://localhost:${port}`);
});
