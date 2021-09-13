import type { AddressInfo } from "net";
import type { RequestOptions } from "undici/types/dispatcher";

import { once } from "events";
import * as assert from "assert";
import snap from "mocha-snap";
import { Client } from "undici";
import express, { ErrorRequestHandler, Handler } from "express";
import { create, configure } from "../index";
import { Server } from "http";

it("basic", async () => {
  await fixture(
    {
      routes: [
        "GET /a => ./b",
        "POST /d => ./e",
        "ALL /f => ./g",
        "GET, POST /h => ./i",
      ],
      load: reflectId,
    },
    [
      { method: "GET", path: "/a" },
      { method: "POST", path: "/d" },
      { method: "PUT", path: "/f" },
      { method: "GET", path: "/h" },
      { method: "POST", path: "/h" },
      { method: "PUT", path: "/h" },
      { method: "GET", path: "/passthrough" },
    ]
  );
});

it("parses params", async () => {
  await fixture(
    {
      routes: [
        "GET /a/:id => ./a",
        "GET /b/:parts* => ./b",
        "GET /c/:parts+ => ./c",
      ],
      load: reflectId,
    },
    [
      { method: "GET", path: "/a" },
      { method: "GET", path: "/a/b" },
      { method: "GET", path: "/b" },
      { method: "GET", path: "/b/c" },
      { method: "GET", path: "/b/c/d" },
      { method: "GET", path: "/c" },
      { method: "GET", path: "/c/d" },
      { method: "GET", path: "/c/d/e" },
    ]
  );
});

it("passes through additional config", async () => {
  await fixture(
    {
      routes: [
        {
          route: "GET /a => ./a",
          additional: true,
        },
      ],
      load: reflectId,
    },
    [{ method: "GET", path: "/a" }]
  );
});

it("exec multiple times", async () => {
  await fixture(
    {
      routes: ["GET /a => ./b"],
      load: reflectId,
    },
    [
      { method: "GET", path: "/a" },
      { method: "GET", path: "/a" },
    ]
  );
});

it("object configs", async () => {
  await fixture(
    {
      routes: [
        {
          method: "GET",
          path: "/a",
          handler: "./b",
        },
        {
          method: "POST",
          path: "/d",
          handler: "./e",
        },
        {
          method: "ALL",
          path: "/f",
          handler: "./g",
        },
        {
          methods: ["GET", "POST"],
          path: "/h",
          handler: "./i",
        },
      ],
      load: reflectId,
    },
    [
      { method: "GET", path: "/a" },
      { method: "POST", path: "/d" },
      { method: "PUT", path: "/f" },
      { method: "GET", path: "/h" },
      { method: "POST", path: "/h" },
      { method: "PUT", path: "/h" },
    ]
  );
});

it("async loader", async () => {
  await fixture(
    {
      routes: ["GET /a => ./b", "POST /d => ./e", "ALL /f => ./g"],
      async load(id) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ((_, res) => {
          res.status(200).set("Content-Type", "text").end(id);
        }) as Handler;
      },
    },
    [
      { method: "GET", path: "/a" },
      { method: "POST", path: "/d" },
      { method: "PUT", path: "/f" },
    ]
  );
});

it("default loader", async () => {
  await fixture(
    {
      routes: [
        "GET /a => ./src/__tests__/fixtures/send-a",
        "GET /b => ./src/__tests__/fixtures/send-b",
      ],
    },
    [
      { method: "GET", path: "/a" },
      { method: "GET", path: "/b" },
    ]
  );
});

it("fails when match is called without init", async () => {
  await snap(async () => {
    await new Promise((resolve, reject) => {
      (create() as any).match()({}, {}, reject);
    });
  });
});

it("fails when getMatch is called without init", async () => {
  await snap(async () => {
    (create() as any).getMatch();
  });
});

it("fails with an invalid route path", async () => {
  await snap(async () => {
    await fixture(
      {
        routes: ["GET /a/* => ./a"],
        load: reflectId,
      },
      [{ method: "GET", path: "/a" }]
    );
  });
});

it("fails with a missing route path", async () => {
  await snap(async () => {
    await fixture(
      {
        routes: [{ test: true }],
        load: reflectId,
      },
      [{ method: "GET", path: "/a" }]
    );
  });
});

it("fails with a missing route handler", async () => {
  await snap(async () => {
    await fixture(
      {
        routes: [{ path: "/a" }],
        load: reflectId,
      },
      [{ method: "GET", path: "/a" }]
    );
  });
});

it("fails when unable to load route async", async () => {
  await fixture(
    {
      routes: ["GET /a => ./a"],
      load() {
        return Promise.reject(new Error("Could not load route"));
      },
    },
    [{ method: "GET", path: "/a" }]
  );
});

it("fails when unable to load route sync", async () => {
  await fixture(
    {
      routes: ["GET /a => ./a"],
      load() {
        throw new Error("Could not load route");
      },
    },
    [{ method: "GET", path: "/a" }]
  );
});

it("fails when load returns an invalid route handler", async () => {
  await fixture(
    {
      routes: ["GET /a => ./a", "GET /b => ./b#c", "GET /c => ./c"],
      load(id) {
        switch (id) {
          case "./a":
            return 1;
          case "./b":
            return {};
          default:
            return undefined;
        }
      },
    },
    [
      { method: "GET", path: "/a" },
      { method: "GET", path: "/b" },
      { method: "GET", path: "/c" },
    ]
  );
});

async function fixture(
  opts: Parameters<typeof configure>[0],
  reqs: RequestOptions[]
) {
  let client: Client | undefined;
  let server: Server | undefined;
  try {
    const metaRouter = create();
    server = express()
      .use(
        metaRouter.match(),
        async (req, res, next) => {
          try {
            assert.deepStrictEqual(req.route, metaRouter.getMatch(req));
            await snap(
              JSON.stringify(req.route, null, 2),
              `${toFileName(req)}.route.json`
            );
            next();
          } catch (err) {
            console.error(err);
            next(err);
          }
        },
        metaRouter.invoke()
      )
      .use(((err, req, res, next) => {
        res.status(500).send(err.message);
      }) as ErrorRequestHandler)
      .get("/passthrough", (req, res) => {
        res.status(200).set("Content-Type", "text").end("passthrough");
      })
      .listen(0);
    await once(server, "listening");
    metaRouter.configure(opts);
    client = new Client(
      `http://localhost:${(server.address() as AddressInfo).port}`
    );

    await Promise.all(
      reqs.map(async (req: RequestOptions) => {
        const res = await client!.request(req);

        let data = `status: ${res.statusCode}\n`;
        res.body.setEncoding("utf-8");

        for await (const chunk of res.body) {
          data += chunk;
        }

        await snap(data, `${toFileName(req)}.data.txt`);
      })
    );
  } finally {
    await Promise.all([
      client?.destroy(),
      server && new Promise((resolve) => server!.close(resolve)),
    ]);
  }
}

function toFileName(data: { method: string; path: string }) {
  return `${data.method} ${data.path
    .replace(/[^a-z0-9$_/-]/gi, "-")
    .replaceAll("/", "⁄")}`;
}

function reflectId(id: string): Handler {
  return ((_, res) => {
    res.status(200).set("Content-Type", "text").end(id);
  }) as Handler;
}
