import express from "express";

const router = express.Router();

router.get("/", async (req, res) => {
  return res.json({
    success: true,
    admin: req.admin,
    user: {
      id: req.user.id,
      email: req.user.email || null,
    },
  });
});

export default router;