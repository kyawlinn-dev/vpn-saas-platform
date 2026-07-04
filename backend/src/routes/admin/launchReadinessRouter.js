import express from "express";
import { getAdminLaunchReadiness } from "../../services/launchReadinessService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const readiness = await getAdminLaunchReadiness();
    return res.json(readiness);
  } catch (error) {
    console.error("admin launch readiness error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to evaluate launch readiness",
      message: error.message,
    });
  }
});

export default router;

