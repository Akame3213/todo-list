import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/app.js";
test("accounts, isolated tasks, conflict protection, profile photos, verification and email reminders", async () => {
  const mails = [];
  const { app, db, sendReminders } = createServer({
    mailer: { sendMail: async (mail) => mails.push(mail) },
    from: "test@example.com",
    origins: ["http://localhost:5173"],
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(path, method = "GET", body, token) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  }
  try {
    assert.equal((await api("/data")).status, 401);
    const a = await api("/auth/register", "POST", {
      name: "Анна",
      email: "anna@example.com",
      password: "test-password-123",
    });
    assert.equal(a.status, 201);
    assert.equal(a.user.verified, false);
    assert.equal(
      (
        await api("/auth/login", "POST", {
          email: "anna@example.com",
          password: "wrong",
        })
      ).status,
      401,
    );
    const login = await api("/auth/login", "POST", {
      email: "ANNA@example.com",
      password: "test-password-123",
    });
    assert.equal(login.status, 200);
    const b = await api("/auth/register", "POST", {
      name: "Борис",
      email: "boris@example.com",
      password: "test-password-456",
    });
    const data = {
      projects: [],
      tasks: [
        {
          id: "one",
          title: "Встреча",
          priority: "high",
          completed: false,
          reminder: new Date(Date.now() - 1000).toISOString(),
          due: "2026-10-25",
          dueTime: "14:35",
          emailReminder: true,
        },
      ],
    };
    assert.equal(
      (await api("/data", "PUT", { data, revision: 0 }, a.token)).revision,
      1,
    );
    assert.equal(
      (await api("/data", "PUT", { data, revision: 0 }, a.token)).status,
      409,
    );
    assert.equal(
      (await api("/data", "GET", null, b.token)).data.tasks.length,
      0,
    );
    await sendReminders();
    assert.equal(mails.length, 2, "unverified users receive no reminders");
    const code = mails[0].text.match(/\d{6}/)[0];
    assert.equal(
      (await api("/auth/verify", "POST", { code: "000000" }, a.token)).status,
      400,
    );
    assert.equal(
      (await api("/auth/verify", "POST", { code }, a.token)).user.verified,
      true,
    );
    await sendReminders();
    assert.equal(mails.length, 3);
    assert.equal(mails[2].to, "anna@example.com");
    assert.match(mails[2].text, /14:35/);
    await sendReminders();
    assert.equal(mails.length, 3, "reminder is not sent twice");
    const avatar = "data:image/png;base64,aGVsbG8=";
    const profile = await api(
      "/me",
      "PUT",
      { name: "Аня", bio: "Мои цели", avatar, accent: "#4455ee" },
      a.token,
    );
    assert.equal(profile.user.avatar, avatar);
    assert.equal(profile.user.name, "Аня");
    assert.equal(
      (
        await api(
          "/me",
          "PUT",
          { name: "Аня", avatar: "data:image/svg+xml;base64,bad" },
          a.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          "/me",
          "PUT",
          {
            name: "Аня",
            password: "new-password-123",
            currentPassword: "incorrect",
          },
          a.token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api(
          "/me",
          "PUT",
          {
            name: "Аня",
            password: "new-password-123",
            currentPassword: "test-password-123",
          },
          a.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await api("/me", "GET", null, login.token)).status,
      401,
      "other sessions revoked on password change",
    );
    assert.equal((await api("/auth/logout", "POST", {}, a.token)).status, 200);
    assert.equal((await api("/me", "GET", null, a.token)).status, 401);
    const forbidden = await fetch(base + "/health", {
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
  }
});
