const express = require("express");
const { Groq } = require("groq-sdk");
require("dotenv").config();

const airoute = express.Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

airoute.post("/analyze", async (req, res) => {
  const { resumeText, jobRole } = req.body;

  if (!resumeText || !jobRole) {
    return res.status(400).json({
      message: "Resume text and job role are required",
    });
  }

  try {
    const prompt = `You are a world-class hiring manager and resume expert.
Analyze the following resume for a "${jobRole}" position.

Resume Content:
---
${resumeText}
---

Provide a detailed analysis. Respond ONLY with a valid JSON object with two keys:
1. "feedback": A string containing constructive feedback. Include strengths, weaknesses, and specific suggestions for improvement. Format using markdown.
2. "score": An integer from 0 to 100 representing fit for the role.`;

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 1,
      top_p: 1,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      reasoning_effort:  "default",
    });

    let aiResult;
    try {
      aiResult = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      console.error(
        "Failed to parse AI response:",
        response.choices[0].message.content
      );
      return res.status(500).json({
        message: "Invalid response from AI.",
      });
    }

    if (typeof aiResult.score !== "number" || !aiResult.feedback) {
      return res.status(500).json({
        message: "AI response missing score or feedback.",
      });
    }

    res.json({
      feedback: aiResult.feedback,
      score: aiResult.score,
    });
  } catch (err) {
    console.error("Groq Error:", err.response?.data || err.message);
    res.status(500).json({
      message: "Failed to get analysis from AI.",
      error: err.message,
    });
  }
  




});

module.exports = airoute;
