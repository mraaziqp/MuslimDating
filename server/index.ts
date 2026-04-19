import "dotenv/config";
import app from "./app.js";

const PORT = process.env.API_PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`[NikahPath API] Listening on http://localhost:${PORT}`);
});
