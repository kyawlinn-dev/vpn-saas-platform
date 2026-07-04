import express from "express";
import { getResellerLaunchReadiness } from "../../services/launchReadinessService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const readiness = await getResellerLaunchReadiness(req.reseller);
    return res.json(readiness);
  } catch (error) {
    console.error("reseller launch readiness error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to evaluate launch readiness",
      message: error.message,
    });
  }
});

export default router;

