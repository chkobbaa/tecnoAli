const http = require("http");
const fs = require("fs");
const path = require("path");
const manualEstateHandler = require("./api/manual-estate.js");

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath === "/api/manual-estate") {
    let bodyData = "";
    req.on("data", (chunk) => {
      bodyData += chunk;
    });
    req.on("end", () => {
      req.body = bodyData;
      // Polyfill status & json on res
      res.status = function (code) {
        this.statusCode = code;
        return this;
      };
      res.json = function (obj) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
        this.end(JSON.stringify(obj));
        return this;
      };
      manualEstateHandler(req, res);
    });
    return;
  }

  // Static files
  let filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
