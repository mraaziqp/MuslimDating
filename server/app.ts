import express from "express";
import {
  syncUserWithDb,
  getUserByFirebaseId,
  updateProfile,
  completeModule,
  getSeekers,
  createConnection,
  getPendingForParent,
  reviewConnection,
} from "../src/actions/user.js";
import type { UserRole } from "../src/lib/schema.js";

const app = express();

app.use(express.json());

// ─── POST /api/users/sync ────────────────────────────────────────────────────
app.post("/api/users/sync", async (req, res) => {
  const { firebaseUid, email, role, phone, displayName, gender, requiresParentalVetting } =
    req.body as {
      firebaseUid: string;
      email: string;
      role: UserRole;
      phone?: string;
      displayName?: string;
      gender?: string;
      requiresParentalVetting?: boolean;
    };

  if (!firebaseUid || !email || !role) {
    return res.status(400).json({ error: "firebaseUid, email, and role are required." });
  }

  try {
    const user = await syncUserWithDb({ firebaseUid, email, role, phone, displayName, gender, requiresParentalVetting });
    return res.json(user);
  } catch (err) {
    console.error("[POST /api/users/sync]", err);
    return res.status(500).json({ error: "Failed to sync user." });
  }
});

// ─── GET /api/users/me?firebaseUid=xxx ───────────────────────────────────────
app.get("/api/users/me", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid query param is required." });

  try {
    const user = await getUserByFirebaseId(firebaseUid);
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json(user);
  } catch (err) {
    console.error("[GET /api/users/me]", err);
    return res.status(500).json({ error: "Failed to fetch user." });
  }
});

// ─── PUT /api/users/profile ──────────────────────────────────────────────────
app.put("/api/users/profile", async (req, res) => {
  const { firebaseUid, ...fields } = req.body as { firebaseUid: string; [key: string]: any };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const user = await updateProfile({ firebaseUid, ...fields });
    return res.json(user);
  } catch (err) {
    console.error("[PUT /api/users/profile]", err);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

// ─── POST /api/users/modules/complete ────────────────────────────────────────
app.post("/api/users/modules/complete", async (req, res) => {
  const { firebaseUid, moduleId } = req.body as { firebaseUid: string; moduleId: string };
  if (!firebaseUid || !moduleId) return res.status(400).json({ error: "firebaseUid and moduleId are required." });

  try {
    const user = await completeModule(firebaseUid, moduleId);
    return res.json(user);
  } catch (err) {
    console.error("[POST /api/users/modules/complete]", err);
    return res.status(500).json({ error: "Failed to complete module." });
  }
});

// ─── GET /api/users/seekers?firebaseUid=xxx ───────────────────────────────────
app.get("/api/users/seekers", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const seekers = await getSeekers(firebaseUid);
    return res.json(seekers);
  } catch (err) {
    console.error("[GET /api/users/seekers]", err);
    return res.status(500).json({ error: "Failed to fetch seekers." });
  }
});

// ─── POST /api/connections ────────────────────────────────────────────────────
app.post("/api/connections", async (req, res) => {
  const { senderFirebaseUid, receiverDbId } = req.body as {
    senderFirebaseUid: string;
    receiverDbId: string;
  };

  if (!senderFirebaseUid || !receiverDbId) {
    return res.status(400).json({ error: "senderFirebaseUid and receiverDbId are required." });
  }

  try {
    const result = await createConnection(senderFirebaseUid, receiverDbId);
    return result.success ? res.json(result) : res.status(409).json(result);
  } catch (err) {
    console.error("[POST /api/connections]", err);
    return res.status(500).json({ error: "Failed to create connection." });
  }
});

// ─── GET /api/connections/pending-parent?firebaseUid=xxx ─────────────────────
app.get("/api/connections/pending-parent", async (req, res) => {
  const { firebaseUid } = req.query as { firebaseUid?: string };
  if (!firebaseUid) return res.status(400).json({ error: "firebaseUid is required." });

  try {
    const pending = await getPendingForParent(firebaseUid);
    return res.json(pending);
  } catch (err) {
    console.error("[GET /api/connections/pending-parent]", err);
    return res.status(500).json({ error: "Failed to fetch pending connections." });
  }
});

// ─── PUT /api/connections/:id ─────────────────────────────────────────────────
app.put("/api/connections/:id", async (req, res) => {
  const { id } = req.params;
  const { firebaseUid, action, mahramId } = req.body as {
    firebaseUid: string;
    action: "approve" | "reject";
    mahramId?: string;
  };

  if (!firebaseUid || !action) {
    return res.status(400).json({ error: "firebaseUid and action are required." });
  }

  try {
    const result = await reviewConnection(id, firebaseUid, action, mahramId);
    return result.success ? res.json(result) : res.status(400).json(result);
  } catch (err) {
    console.error("[PUT /api/connections/:id]", err);
    return res.status(500).json({ error: "Failed to update connection." });
  }
});

export default app;
