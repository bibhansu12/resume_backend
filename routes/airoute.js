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
    const prompt = `
You are a world-class hiring manager and resume expert.

Analyze the following resume for a "${jobRole}" position.

Resume Content:
---
${resumeText}
---

Return ONLY a valid JSON object with EXACTLY these keys and types:

{
  "score": 0,
  "feedback": "string"
}

Where:

- "score" is an integer between 0 and 100 (number type, not string).
- "feedback" is a markdown-formatted string that contains **three sections**:

  ## Strengths
  - bullet points of strengths

  ## Weaknesses
  - bullet points of weaknesses

  ## Suggestions
  - bullet points of specific, actionable suggestions for improvement

Rules:
- Do NOT include any other keys.
- Do NOT include any text before or after the JSON object.
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,              
      max_completion_tokens: 512,
      top_p: 1,
      stream: false,
      response_format: { type: "json_object" },
    });

    const rawContent = chatCompletion.choices[0].message.content;
    console.log("Raw AI content:", rawContent);

    let aiResult;
    try {
      aiResult = JSON.parse(rawContent);
    } catch (e) {
      console.error("JSON parse failed:", e);
      return res.status(500).json({
        message: "AI returned invalid JSON.",
      });
    }

    console.log("Parsed AI result:", aiResult);

    let { score, feedback } = aiResult;

    // Coerce "72" -> 72 if needed
    if (typeof score === "string" && !isNaN(parseInt(score, 10))) {
      score = parseInt(score, 10);
    }

    if (
      typeof score !== "number" ||
      Number.isNaN(score) ||
      score < 0 ||
      score > 100 ||
      typeof feedback !== "string" ||
      feedback.trim().length === 0
    ) {
      return res.status(500).json({
        message: "AI response missing or invalid score or feedback.",
      });
    }

    return res.json({
      score,
      feedback, // markdown with Strengths / Weaknesses / Suggestions headings
    });
  } catch (err) {
    console.error("Groq Error:", err);

    if (err.status === 413 || err.error?.code === "rate_limit_exceeded") {
      return res.status(413).json({
        message: "Rate limit exceeded. Please wait and try again.",
      });
    }

    return res.status(500).json({
      message: "Failed to get analysis from AI.",
      error: err.message,
    });
  }
});

module.exports = airoute;